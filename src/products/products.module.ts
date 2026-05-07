import { Module } from '@nestjs/common';
import { SlugService } from './services/slug.service';
import { SeoService } from './services/seo.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, SlugService, SeoService],
  exports: [ProductsService, SlugService, SeoService],
})
export class ProductsModule {}
