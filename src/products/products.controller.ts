import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { QueryProductsDto } from './dto/query-products.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Catálogo público (solo activos, no borradores ni eliminados lógicos)' })
  findAll(@Query() query: QueryProductsDto) {
    return this.products.findMany(query, { publicOnly: true });
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Detalle por slug' })
  bySlug(@Param('slug') slug: string) {
    return this.products.findOneBySlug(slug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle por id' })
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }
}
