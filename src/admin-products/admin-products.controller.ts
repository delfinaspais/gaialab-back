import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { getAdminApiSegment } from '../common/config/admin-api-path';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/interfaces/express-user.interface';
import { AdminProductsService } from './admin-products.service';
import { AdminProductFilterDto } from './dto/admin-product-filter.dto';
import { BulkAdminProductUpdateDto } from './dto/bulk-update.dto';
import { CreateAdminProductDto } from './dto/create-admin-product.dto';
import { InventoryAdjustmentDto } from './dto/inventory-adjust.dto';
import { ProductStatusPatchDto } from './dto/product-status-patch.dto';
import { ReorderImagesDto } from './dto/reorder-images.dto';
import { UpdateAdminProductDto } from './dto/update-admin-product.dto';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_MP4 = new Set(['video/mp4']);

@ApiTags('admin-products')
@Controller(`${getAdminApiSegment()}/products`)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminProductsController {
  constructor(private readonly adminProducts: AdminProductsService) {}

  private assertImageBatch(files?: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('Selecciona al menos un archivo');
    for (const f of files) {
      if (!IMAGE_MIMES.has(f.mimetype)) {
        throw new BadRequestException(`Formato no permitido: ${f.mimetype}. Usa JPEG, PNG o WebP.`);
      }
    }
  }

  private assertVideoBatch(files?: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('Selecciona al menos un video');
    for (const f of files) {
      if (!VIDEO_MP4.has(f.mimetype)) {
        throw new BadRequestException('Solo se admite MP4');
      }
    }
  }

  @Get()
  @ApiOperation({ summary: 'Listado paginado con filtros' })
  list(@Query() q: AdminProductFilterDto) {
    return this.adminProducts.list(q);
  }

  @Get('export')
  @ApiOperation({ summary: 'Exportar CSV (Excel en roadmap)' })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['csv', 'xlsx'],
    description: 'Por ahora solo csv',
  })
  async exportCsv(
    @Res({ passthrough: false }) res: Response,
    @Query('format') format?: string,
  ) {
    if (format === 'xlsx') {
      throw new BadRequestException('Excel (.xlsx) aún no implementado; use format=csv o omita el parámetro.');
    }
    const csv = await this.adminProducts.exportCsvRows();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products-export.csv"');
    res.send('\uFEFF' + csv);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Productos con stock bajo' })
  lowStock(@Query('threshold') threshold?: string) {
    const t = threshold ? parseInt(threshold, 10) : 5;
    return this.adminProducts.lowStock(Number.isFinite(t) ? t : 5);
  }

  @Post('bulk-update')
  @ApiOperation({ summary: 'Actualización masiva por ID' })
  bulkUpdate(@Body() body: BulkAdminProductUpdateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminProducts.bulkUpdate(body, user?.id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear producto' })
  create(@Body() dto: CreateAdminProductDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminProducts.create(dto, user?.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle completo' })
  detail(@Param('id') id: string) {
    return this.adminProducts.detail(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualización completa' })
  update(@Param('id') id: string, @Body() dto: UpdateAdminProductDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminProducts.updateFull(id, dto, user?.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cambiar activo/borrador' })
  patchStatus(
    @Param('id') id: string,
    @Body() dto: ProductStatusPatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminProducts.patchStatus(id, dto, user?.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminación lógica' })
  softDelete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminProducts.softDelete(id, user?.id);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicar como borrador/inactivo' })
  duplicate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminProducts.duplicate(id, user?.id);
  }

  @Post(':id/inventory')
  @ApiOperation({ summary: 'Movimiento de inventario manual (IN / OUT / ADJUSTMENT)' })
  inventory(
    @Param('id') id: string,
    @Body() dto: InventoryAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminProducts.adjustInventory(id, dto, user?.id);
  }

  @Post(':id/images')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertImageBatch(files);
    return this.adminProducts.addImages(id, files, user?.id);
  }

  @Put(':id/images/reorder')
  @ApiOperation({ summary: 'Reordenar imágenes' })
  reorderImages(
    @Param('id') id: string,
    @Body() dto: ReorderImagesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminProducts.reorderImages(id, dto.orderedImageIds, user?.id);
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'Eliminar imagen' })
  deleteImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminProducts.deleteImage(id, imageId, user?.id);
  }

  @Post(':id/videos')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 3))
  async uploadVideos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertVideoBatch(files);
    return this.adminProducts.addVideos(id, files, user?.id);
  }
}
