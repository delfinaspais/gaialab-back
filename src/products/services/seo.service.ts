import { Injectable } from '@nestjs/common';

/** Rellena SEO vacío a partir de nombre y descripción corta. */
@Injectable()
export class SeoService {
  buildSeo(product: { name: string; shortDescription?: string | null; seoTitle?: string | null; seoDescription?: string | null }) {
    const title = product.seoTitle?.trim() || product.name.slice(0, 70);
    const descSource = product.shortDescription?.trim() || product.name;
    const description = product.seoDescription?.trim() || descSource.slice(0, 160);
    return { seoTitle: title, seoDescription: description };
  }
}
