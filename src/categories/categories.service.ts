import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slug.util';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllFlat() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { products: true, children: true } },
      },
    });
  }

  async findTree() {
    const all = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        children: {
          orderBy: { name: 'asc' },
          include: { _count: { select: { products: true } } },
        },
        _count: { select: { products: true } },
      },
    });
    return all.filter((c) => c.parentId === null);
  }

  async findOne(id: string) {
    const c = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });
    if (!c) throw new NotFoundException('Categoría no encontrada');
    return c;
  }

  async create(dto: CreateCategoryDto) {
    let slug = dto.slug?.trim() ? slugify(dto.slug!) : slugify(dto.name);
    slug = await this.ensureUniqueSlug(slug);
    if (dto.parentId) {
      await this.ensureParentExists(dto.parentId);
    }
    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        parentId: dto.parentId ?? undefined,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.ensureExists(id);
    let slug: string | undefined;
    if (dto.slug !== undefined) {
      slug = dto.slug?.trim() ? slugify(dto.slug) : slugify(dto.name ?? '');
    } else if (dto.name) {
      slug = slugify(dto.name);
    }
    if (slug) {
      slug = await this.ensureUniqueSlug(slug, id);
    }
    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new ConflictException('Una categoría no puede ser padre de sí misma');
      }
      await this.ensureParentExists(dto.parentId);
    }
    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    const children = await this.prisma.category.count({ where: { parentId: id } });
    if (children) {
      throw new ConflictException('No se puede eliminar: tiene subcategorías');
    }
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureExists(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('Categoría no encontrada');
  }

  private async ensureParentExists(parentId: string) {
    const p = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!p) throw new NotFoundException('Categoría padre no encontrada');
  }

  private async ensureUniqueSlug(base: string, excludeId?: string) {
    let slug = base;
    let i = 0;
    for (;;) {
      const existing = await this.prisma.category.findFirst({
        where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      });
      if (!existing) return slug;
      i += 1;
      slug = `${base}-${i}`;
    }
  }
}
