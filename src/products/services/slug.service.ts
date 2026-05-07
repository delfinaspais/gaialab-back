import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slug.util';

@Injectable()
export class SlugService {
  constructor(private readonly prisma: PrismaService) {}

  fromNameOrInput(name: string, input?: string | null) {
    const base = input?.trim() ? slugify(input) : slugify(name);
    return this.ensureUnique(base);
  }

  async ensureUnique(base: string, excludeProductId?: string) {
    let slug = base;
    let i = 0;
    for (;;) {
      const existing = await this.prisma.product.findFirst({
        where: { slug, ...(excludeProductId ? { NOT: { id: excludeProductId } } : {}) },
      });
      if (!existing) return slug;
      i += 1;
      slug = `${base}-${i}`;
    }
  }
}
