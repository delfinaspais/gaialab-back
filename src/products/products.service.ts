import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryProductsDto } from './dto/query-products.dto';

const publicCatalogInclude = {
  categories: {
    where: { isActive: true },
    select: { id: true, name: true, slug: true },
  },
  tags: { select: { id: true, name: true, color: true } },
  images: { orderBy: { position: 'asc' as const } },
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private catalogWhereBase(): Prisma.ProductWhereInput {
    return {
      isDeleted: false,
      isDraft: false,
      isActive: true,
    };
  }

  async findMany(query: QueryProductsDto, options?: { publicOnly?: boolean }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput =
      options?.publicOnly || query.isActive === true
        ? { ...this.catalogWhereBase() }
        : query.isActive === false
          ? { isDeleted: false, isActive: false }
          : { isDeleted: false };

    if (query.categoryId) {
      where.categories = { some: { id: query.categoryId } };
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { shortDescription: { contains: s, mode: 'insensitive' } },
        { sku: { contains: s, mode: 'insensitive' } },
        { material: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: publicCatalogInclude,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, ...this.catalogWhereBase() },
      include: publicCatalogInclude,
    });
    if (!p) throw new NotFoundException('Producto no encontrado');
    await this.prisma.product
      .update({
        where: { id },
        data: { analyticsViewCount: { increment: 1 } },
      })
      .catch(() => undefined);
    return p;
  }

  async findOneBySlug(slug: string, publicOnly = true) {
    const p = await this.prisma.product.findFirst({
      where: {
        slug,
        ...(publicOnly ? this.catalogWhereBase() : { isDeleted: false }),
      },
      include: publicCatalogInclude,
    });
    if (!p) throw new NotFoundException('Producto no encontrado');
    await this.prisma.product
      .update({
        where: { id: p.id },
        data: { analyticsViewCount: { increment: 1 } },
      })
      .catch(() => undefined);
    return p;
  }
}
