import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { getAdminApiSegment } from '../common/config/admin-api-path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AndreaniService } from './andreani.service';
import { AndreaniQuoteDto } from './dto/andreani-quote.dto';
import { AndreaniShipmentDto } from './dto/andreani-shipment.dto';

@ApiTags('shipping')
@Controller(`${getAdminApiSegment()}/shipping`)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class ShippingController {
  constructor(private readonly andreani: AndreaniService) {}

  @Post('andreani/quote')
  @ApiOperation({
    summary: 'Cotizar envío (admin). Rutas Andreani parametrizables vía ENV.',
  })
  quote(@Body() dto: AndreaniQuoteDto) {
    return this.andreani.quoteTariff(dto.originZip, dto.destinationZip, dto.weightKg);
  }

  @Post('andreani/shipment')
  @ApiOperation({
    summary: 'Crear envío (admin). Amplíe el body según manual Andreani.',
  })
  shipment(@Body() dto: AndreaniShipmentDto) {
    let extra: Record<string, unknown> = {};
    if (dto.rawPayload?.trim()) {
      try {
        extra = JSON.parse(dto.rawPayload) as Record<string, unknown>;
        if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
          throw new Error('invalid shape');
        }
      } catch {
        throw new BadRequestException('rawPayload debe ser un objeto JSON válido');
      }
    }
    return this.andreani.createShipment(dto.orderId, extra);
  }
}
