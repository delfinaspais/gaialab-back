import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GuestSessionHeader } from '../common/decorators/guest-session-header.decorator';
import { GuestOrderTokenHeader } from '../common/decorators/guest-order-token.decorator';
import { AuthenticatedUser } from '../common/interfaces/express-user.interface';
import { GUEST_ORDER_TOKEN_HEADER, GUEST_SESSION_HEADER } from '../common/constants/http-headers';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('checkout')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: GUEST_SESSION_HEADER, required: false, description: 'Obligatorio si no hay JWT' })
  @ApiOperation({
    summary: 'Checkout desde carrito (vacía el carrito). Con JWT: orden vinculada al usuario. Sin JWT: invitado + guestEmail + header de sesión.',
  })
  checkout(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @GuestSessionHeader() guestSessionId: string | undefined,
    @Body() dto: CreateOrderDto,
  ) {
    if (user) {
      return this.orders.checkout({ userId: user.id }, dto);
    }
    if (!guestSessionId?.trim()) {
      throw new BadRequestException(
        `Sin sesión: enviá ${GUEST_SESSION_HEADER} o iniciá sesión`,
      );
    }
    return this.orders.checkout({ guestSessionId: guestSessionId.trim() }, dto);
  }

  @Get('guest/:orderId')
  @ApiHeader({ name: GUEST_ORDER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Detalle de orden de invitado (token devuelto solo al hacer checkout)' })
  guestOrder(@Param('orderId') orderId: string, @GuestOrderTokenHeader() token: string | undefined) {
    return this.orders.findOneAsGuest(orderId, token);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mis órdenes (requiere cuenta)' })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.findMine(user.id);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Todas las órdenes (admin)' })
  adminAll() {
    return this.orders.findAllAdmin();
  }

  @Patch('admin/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar estado (admin)' })
  adminStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.updateStatusAdmin(id, dto.status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalle (dueño cuenta o admin). Invitados: GET orders/guest/:id' })
  one(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.findOneForUser(id, user.id, user.role);
  }
}
