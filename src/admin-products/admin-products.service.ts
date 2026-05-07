import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryLogType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slug.util';
import { SlugService } from '../products/services/slug.service';
import { SeoService } from '../products/services/seo.service';
import { ImageProcessingService } from '../upload/image-processing.service';
import { VideoProcessingService } from '../upload/video-processing.service';
import { CloudinaryService } from '../upload/cloudinary.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateAdminProductDto } from './dto/create-admin-product.dto';
import { UpdateAdminProductDto } from './dto/update-admin-product.dto';
import { AdminProductFilterDto } from './dto/admin-product-filter.dto';
import { InventoryAdjustmentDto } from './dto/inventory-adjust.dto';

const fullInclude = {
  categories: true,
  tags: true,
  images: { orderBy: { position: 'asc' as const } },
  videos: { orderBy: { position: 'asc' as const } },
} as const;

@Injectable()
export class AdminProductsService {
  private readonly maxImages = 10;
  private readonly maxVideos = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly slug: SlugService,
    private readonly seo: SeoService,
    private readonly images: ImageProcessingService,
    private readonly videos: VideoProcessingService,
    private readonly cloudinary: CloudinaryService,
    private readonly inventory: InventoryService,
  ) {}

  private estimatePrintMinutes(weightKg?: number, material?: string | null): number | null {
    if (weightKg == null || Number.isNaN(Number(weightKg))) return null;
    let m = Number(weightKg) * 12;
    const mat = (material ?? '').toLowerCase();
    if (mat.includes('abs')) m *= 1.15;
    if (mat.includes('petg')) m *= 1.08;
    return Math.max(1, Math.round(m));
  }

  private assertPriceVsCost(price: Prisma.Decimal, cost?: Prisma.Decimal | null) {
    if (cost != null && !price.gt(cost)) {
      throw new BadRequestException('El precio debe ser mayor al costo');
    }
  }

  private dimsToJson(d?: { length?: number; width?: number; height?: number } | null): Prisma.InputJsonValue | undefined {
    if (!d) return undefined;
    if (d.length == null && d.width == null && d.height == null) return undefined;
    return { length: d.length ?? null, width: d.width ?? null, height: d.height ?? null };
  }

  private async audit(actorId: string | undefined, productId: string | null, action: string, metadata?: object) {
    await this.prisma.productAuditLog.create({
      data: {
        productId,
        actorId: actorId ?? undefined,
        action,
        metadata: metadata ?? undefined,
      },
    });
  }

  private async bumpVersion(productId: string) {
    const last = await this.prisma.productVersion.aggregate({
      where: { productId },
      _max: { version: true },
    });
    const v = (last._max.version ?? 0) + 1;
    const row = await this.prisma.product.findUnique({
      where: { id: productId },
      include: fullInclude,
    });
    if (!row) return;
    await this.prisma.productVersion.create({
      data: { productId, version: v, snapshot: row as unknown as Prisma.InputJsonValue },
    });
  }

  /** Combina IDs existentes + tags nuevas (nombre único insensible). */
  private async mergeTagIds(existingIds: string[], newTags?: { name: string; color?: string }[]): Promise<string[]> {
    const ids = [...existingIds];
    for (const t of newTags ?? []) {
      const nameKey = t.name.trim();
      let tag = await this.prisma.productTag.findFirst({
        where: { name: { equals: nameKey, mode: 'insensitive' } },
      });
      if (!tag) {
        tag = await this.prisma.productTag.create({ data: { name: nameKey, color: t.color } });
      } else if (t.color) {
        tag = await this.prisma.productTag.update({ where: { id: tag.id }, data: { color: t.color } });
      }
      if (!ids.includes(tag.id)) ids.push(tag.id);
    }
    return ids;
  }

  async list(filters: AdminProductFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.ProductWhereInput = {};

    if (!filters.includeDeleted) where.isDeleted = false;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    if (filters.isDraft !== undefined) where.isDraft = filters.isDraft;
    if (filters.categoryId) where.categories = { some: { id: filters.categoryId } };
    if (filters.search?.trim()) {
      const s = filters.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { sku: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
      ];
    }

    const listInclude = {
      categories: { select: { id: true, name: true, slug: true } },
      tags: { select: { id: true, name: true } },
      images: { take: 1, orderBy: { position: 'asc' as const } },
    };

    if (filters.lowStockOnly) {
      const all = await this.prisma.product.findMany({
        where: { ...where, trackQuantity: true },
        orderBy: { updatedAt: 'desc' },
        include: listInclude,
      });
      const filtered = all.filter((p) => p.quantity <= (p.lowStockThreshold ?? 5));
      const total = filtered.length;
      const data = filtered.slice(skip, skip + limit);
      return {
        data,
        meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: listInclude,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async detail(id: string) {
    const p = await this.prisma.product.findFirst({
      where: { id },
      include: fullInclude,
    });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  async create(dto: CreateAdminProductDto, actorId?: string) {
    const sku = dto.sku.trim();
    await this.ensureSkuUnique(sku);

    const slug = await this.slug.fromNameOrInput(dto.name, dto.slug ?? null);
    const price = new Prisma.Decimal(dto.price);
    const cost = dto.costPrice != null ? new Prisma.Decimal(dto.costPrice) : null;
    const compare = dto.comparePrice != null ? new Prisma.Decimal(dto.comparePrice) : null;
    this.assertPriceVsCost(price, cost);

    await this.ensureCategories(dto.categoryIds);
    const tagIds = await this.mergeTagIds(dto.tagIds ?? [], dto.newTags);
    const seo = this.seo.buildSeo({
      name: dto.name,
      shortDescription: dto.shortDescription,
      seoTitle: dto.seoTitle,
      seoDescription: dto.seoDescription,
    });
    const printTime =
      dto.printTimeMinutes ??
      this.estimatePrintMinutes(dto.weightKg ?? undefined, dto.material) ??
      undefined;

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        shortDescription: dto.shortDescription,
        description: dto.description,
        sku,
        price,
        comparePrice: compare,
        costPrice: cost,
        trackQuantity: dto.trackQuantity ?? true,
        quantity: dto.quantity ?? 0,
        lowStockThreshold: dto.lowStockThreshold ?? 5,
        weightKg: dto.weightKg != null ? new Prisma.Decimal(dto.weightKg) : null,
        ...((): { dimensions: Prisma.InputJsonValue } | Record<string, never> => {
          const d = this.dimsToJson(dto.dimensions ?? null);
          return d !== undefined ? { dimensions: d } : {};
        })(),
        material: dto.material,
        printTimeMinutes: printTime,
        isDraft: dto.isDraft ?? false,
        isActive: dto.isDraft ? false : dto.isActive ?? true,
        seoTitle: seo.seoTitle,
        seoDescription: seo.seoDescription,
        categories: { connect: dto.categoryIds.map((id) => ({ id })) },
        tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
      },
      include: fullInclude,
    });

    await this.audit(actorId, product.id, 'product.create', { sku: product.sku });
    await this.bumpVersion(product.id);

    return product;
  }

  async updateFull(id: string, dto: UpdateAdminProductDto, actorId?: string) {
    await this.ensureProduct(id);
    if (dto.sku?.trim()) await this.ensureSkuUnique(dto.sku.trim(), id);
    if (dto.categoryIds?.length) await this.ensureCategories(dto.categoryIds);

    const current = await this.prisma.product.findUnique({
      where: { id },
      include: { tags: { select: { id: true } } },
    });
    if (!current) throw new NotFoundException();

    const price =
      dto.price !== undefined ? new Prisma.Decimal(dto.price) : current.price;
    const cost =
      dto.costPrice !== undefined
        ? dto.costPrice != null
          ? new Prisma.Decimal(dto.costPrice)
          : null
        : current.costPrice;
    this.assertPriceVsCost(price, cost ?? undefined);

    const slug =
      dto.slug !== undefined && dto.slug?.trim()
        ? await this.slug.ensureUnique(slugify(dto.slug), id)
        : dto.name
          ? await this.slug.ensureUnique(slugify(dto.name), id)
          : undefined;

    const seo =
      dto.seoTitle !== undefined || dto.seoDescription !== undefined || dto.shortDescription !== undefined || dto.name
        ? this.seo.buildSeo({
            name: dto.name ?? current.name,
            shortDescription: dto.shortDescription ?? current.shortDescription,
            seoTitle: dto.seoTitle ?? current.seoTitle,
            seoDescription: dto.seoDescription ?? current.seoDescription,
          })
        : undefined;

    const data: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (slug !== undefined) data.slug = slug;
    if (dto.shortDescription !== undefined) data.shortDescription = dto.shortDescription;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.sku !== undefined) data.sku = dto.sku.trim();
    if (dto.price !== undefined) data.price = new Prisma.Decimal(dto.price);
    if (dto.comparePrice !== undefined) {
      data.comparePrice = dto.comparePrice == null ? null : new Prisma.Decimal(dto.comparePrice);
    }
    if (dto.costPrice !== undefined) {
      data.costPrice = dto.costPrice == null ? null : new Prisma.Decimal(dto.costPrice);
    }
    if (dto.trackQuantity !== undefined) data.trackQuantity = dto.trackQuantity;
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.lowStockThreshold !== undefined) data.lowStockThreshold = dto.lowStockThreshold;
    if (dto.weightKg !== undefined) {
      data.weightKg = dto.weightKg == null ? null : new Prisma.Decimal(dto.weightKg);
    }
    if (dto.dimensions !== undefined) {
      data.dimensions = this.dimsToJson(dto.dimensions) ?? Prisma.JsonNull;
    }
    if (dto.material !== undefined) data.material = dto.material;
    if (dto.printTimeMinutes !== undefined) data.printTimeMinutes = dto.printTimeMinutes;
    if (dto.isDraft !== undefined) data.isDraft = dto.isDraft;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (seo) {
      data.seoTitle = seo.seoTitle;
      data.seoDescription = seo.seoDescription;
    }
    if (dto.categoryIds?.length) {
      data.categories = { set: dto.categoryIds.map((cid) => ({ id: cid })) };
    }

    if (dto.tagIds !== undefined || dto.newTags?.length) {
      const tagIds = await this.mergeTagIds(
        dto.tagIds ?? current.tags.map((t) => t.id),
        dto.newTags,
      );
      data.tags = { set: tagIds.map((tid) => ({ id: tid })) };
    }

    const product = await this.prisma.product.update({
      where: { id },
      data,
      include: fullInclude,
    });

    await this.audit(actorId, id, 'product.update', {});
    await this.bumpVersion(id);
    return product;
  }

  async patchStatus(id: string, dto: { isActive?: boolean; isDraft?: boolean }, actorId?: string) {
    await this.ensureProduct(id);
    if (dto.isActive === undefined && dto.isDraft === undefined) {
      throw new BadRequestException('Indica al menos isActive o isDraft');
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isDraft !== undefined ? { isDraft: dto.isDraft } : {}),
      },
      include: fullInclude,
    });
    await this.audit(actorId, id, 'product.status', dto);
    return product;
  }

  async softDelete(id: string, actorId?: string) {
    await this.ensureProduct(id);
    await this.prisma.product.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false, isDraft: false },
    });
    await this.audit(actorId, id, 'product.soft_delete', {});
    return { deleted: true };
  }

  async addImages(productId: string, files: Express.Multer.File[], actorId?: string) {
    await this.ensureProduct(productId);
    const count = await this.prisma.productImage.count({ where: { productId } });
    if (count + files.length > this.maxImages) {
      throw new BadRequestException(`Máximo ${this.maxImages} imágenes por producto`);
    }
    let pos = (await this.prisma.productImage.aggregate({ where: { productId }, _max: { position: true } }))._max
      .position ?? -1;
    const hasMain = await this.prisma.productImage.findFirst({ where: { productId, isMain: true } });
    const created: unknown[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const up = await this.images.processAndUpload(
        file.buffer,
        `${productId}-${Date.now()}-${file.originalname}`,
      );
      pos += 1;
      const isMain = !hasMain && i === 0;
      const img = await this.prisma.productImage.create({
        data: {
          productId,
          url: up.url,
          publicId: up.publicId,
          thumbnailUrl: up.thumbnailUrl ?? null,
          altText: null,
          position: pos,
          isMain,
        },
      });
      created.push(img);
      if (isMain) await this.prisma.productImage.updateMany({
        where: { productId, NOT: { id: img.id } },
        data: { isMain: false },
      });
    }
    await this.audit(actorId, productId, 'product.images.add', { count: files.length });
    await this.bumpVersion(productId);
    return created;
  }

  async reorderImages(productId: string, orderedIds: string[], actorId?: string) {
    await this.ensureProduct(productId);
    const imgs = await this.prisma.productImage.findMany({ where: { productId } });
    if (orderedIds.length !== imgs.length) throw new BadRequestException('La lista debe incluir todas las imágenes');
    const set = new Set(imgs.map((x) => x.id));
    if (!orderedIds.every((id) => set.has(id))) throw new BadRequestException('IDs inválidos');

    await this.prisma.$transaction(
      orderedIds.map((imageId, idx) =>
        this.prisma.productImage.update({ where: { id: imageId }, data: { position: idx } }),
      ),
    );
    await this.audit(actorId, productId, 'product.images.reorder', { orderedIds });
    return this.detail(productId);
  }

  async deleteImage(productId: string, imageId: string, actorId?: string) {
    const img = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!img) throw new NotFoundException('Imagen no encontrada');
    await this.prisma.productImage.delete({ where: { id: imageId } });
    await this.cloudinary.deleteByPublicId(img.publicId, 'image').catch(() => undefined);
    await this.audit(actorId, productId, 'product.images.delete', { imageId });
    await this.bumpVersion(productId);
    return { deleted: true };
  }

  async addVideos(productId: string, files: Express.Multer.File[], actorId?: string) {
    await this.ensureProduct(productId);
    const count = await this.prisma.productVideo.count({ where: { productId } });
    if (count + files.length > this.maxVideos) throw new BadRequestException(`Máximo ${this.maxVideos} videos`);

    let pos =
      (await this.prisma.productVideo.aggregate({ where: { productId }, _max: { position: true } }))._max.position ?? -1;

    const created: unknown[] = [];
    for (const file of files) {
      const up = await this.videos.upload(file.buffer, `${productId}-v-${Date.now()}-${file.originalname}`);
      pos += 1;
      const v = await this.prisma.productVideo.create({
        data: {
          productId,
          url: up.url,
          publicId: up.publicId ?? null,
          thumbnail: up.thumbnailUrl ?? null,
          position: pos,
        },
      });
      created.push(v);
    }
    await this.audit(actorId, productId, 'product.videos.add', { count: files.length });
    await this.bumpVersion(productId);
    return created;
  }

  async lowStock(threshold = 5) {
    const products = await this.prisma.product.findMany({
      where: { isDeleted: false, trackQuantity: true, isActive: true },
      include: { categories: true, images: { take: 1, orderBy: { position: 'asc' } } },
    });
    return products.filter((p) => p.quantity <= (p.lowStockThreshold ?? threshold));
  }

  async duplicate(id: string, actorId?: string) {
    const src = await this.prisma.product.findUnique({
      where: { id },
      include: { categories: true, tags: true, images: true, videos: true },
    });
    if (!src || src.isDeleted) throw new NotFoundException('Producto no encontrado');

    const sku = await this.nextSkuCopy(src.sku);
    const slug = await this.slug.ensureUnique(slugify(`${src.name}-copia`));

    const created = await this.prisma.product.create({
      data: {
        name: `${src.name} (copia)`,
        slug,
        sku,
        shortDescription: src.shortDescription,
        description: src.description,
        price: src.price,
        comparePrice: src.comparePrice,
        costPrice: src.costPrice,
        trackQuantity: src.trackQuantity,
        quantity: src.quantity,
        lowStockThreshold: src.lowStockThreshold,
        weightKg: src.weightKg,
        dimensions: src.dimensions ?? undefined,
        material: src.material,
        printTimeMinutes: src.printTimeMinutes,
        isDraft: true,
        isActive: false,
        isDeleted: false,
        deletedAt: null,
        seoTitle: src.seoTitle,
        seoDescription: src.seoDescription,
        analyticsViewCount: 0,
        categories: { connect: src.categories.map((c) => ({ id: c.id })) },
        tags: { connect: src.tags.map((t) => ({ id: t.id })) },
        images: {
          createMany: {
            data: src.images.map((im) => ({
              url: im.url,
              publicId: im.publicId,
              altText: im.altText,
              thumbnailUrl: im.thumbnailUrl,
              position: im.position,
              isMain: im.isMain,
            })),
          },
        },
        videos: {
          createMany: {
            data: src.videos.map((v) => ({
              url: v.url,
              publicId: v.publicId ?? null,
              thumbnail: v.thumbnail,
              position: v.position,
            })),
          },
        },
      },
      include: fullInclude,
    });

    await this.audit(actorId, created.id, 'product.duplicate', { fromId: id });
    await this.bumpVersion(created.id);
    return created;
  }

  private async nextSkuCopy(baseSku: string): Promise<string> {
    for (let i = 0; i < 100; i += 1) {
      const cand = i === 0 ? `${baseSku}-COPY` : `${baseSku}-COPY-${i}`;
      const exists = await this.prisma.product.findUnique({ where: { sku: cand } });
      if (!exists) return cand;
    }
    throw new ConflictException('No se pudo generar SKU para la copia');
  }

  async bulkUpdate(dto: { items: { productId: string; patch: UpdateAdminProductDto }[] }, actorId?: string) {
    const results: unknown[] = [];
    for (const item of dto.items) {
      results.push(await this.updateFull(item.productId, item.patch, actorId));
    }
    await this.audit(actorId, null, 'product.bulk_update', { count: dto.items.length });
    return { updated: results.length, results };
  }

  async exportCsvRows() {
    const rows = await this.prisma.product.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      include: { categories: { select: { name: true } } },
    });

    const headers = ['id', 'sku', 'name', 'price', 'quantity', 'isActive', 'isDraft', 'categories'];
    const esc = (v: string | number | boolean) =>
      `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          esc(r.id),
          esc(r.sku),
          esc(r.name),
          esc(r.price.toString()),
          esc(r.quantity),
          esc(r.isActive),
          esc(r.isDraft),
          esc(r.categories.map((c) => c.name).join(';')),
        ].join(','),
      ),
    ];
    return lines.join('\n');
  }

  async adjustInventory(productId: string, dto: InventoryAdjustmentDto, actorId?: string) {
    await this.ensureProduct(productId);
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException();
    if (!product.trackQuantity) {
      throw new BadRequestException('Este producto no rastrea cantidad');
    }

    let delta = 0;
    let logType: InventoryLogType = dto.type;
    let logQty = 0;

    if (dto.type === InventoryLogType.IN) {
      if (dto.value < 1) throw new BadRequestException('IN requiere valor > 0');
      delta = dto.value;
      logQty = dto.value;
    } else if (dto.type === InventoryLogType.OUT) {
      if (dto.value < 1) throw new BadRequestException('OUT requiere valor > 0');
      delta = -dto.value;
      logQty = dto.value;
    } else {
      delta = dto.value;
      logQty = Math.abs(dto.value);
    }

    if (product.trackQuantity && product.quantity + delta < 0) {
      throw new BadRequestException('Stock insuficiente');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { quantity: { increment: delta } },
      });
      await this.inventory.record(tx, {
        productId,
        type: logType,
        quantity: logQty,
        reason: dto.reason,
        userId: actorId ?? null,
      });
    });

    await this.audit(actorId, productId, 'inventory.adjust', { type: dto.type, value: dto.value });
    return this.detail(productId);
  }

  private async ensureProduct(id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, isDeleted: false } });
    if (!p) throw new NotFoundException('Producto no encontrado');
  }

  private async ensureSkuUnique(sku: string, excludeId?: string) {
    const existing = await this.prisma.product.findFirst({
      where: { sku, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
    if (existing) throw new ConflictException('SKU ya en uso');
  }

  private async ensureCategories(ids: string[]) {
    for (const id of ids) {
      const c = await this.prisma.category.findUnique({ where: { id } });
      if (!c) throw new BadRequestException(`Categoría inválida: ${id}`);
    }
  }
}
