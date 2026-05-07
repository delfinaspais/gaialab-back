import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GuestSessionHeader } from '../common/decorators/guest-session-header.decorator';
import { AuthenticatedUser } from '../common/interfaces/express-user.interface';
import { GUEST_SESSION_HEADER } from '../common/constants/http-headers';
import { CartOwner, CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { MergeCartDto } from './dto/merge-cart.dto';

@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Post('guest-session')
  @ApiOperation({ summary: 'Crear sesión de carrito invitado (guardar guestSessionId en localStorage y enviar header en cada request)' })
  guestSession() {
    return this.cart.createGuestSession();
  }

  @Post('merge')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unir carrito invitado al usuario logueado' })
  merge(@CurrentUser() user: AuthenticatedUser, @Body() dto: MergeCartDto) {
    return this.cart.mergeGuestIntoUser(user.id, dto.guestSessionId);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: GUEST_SESSION_HEADER, required: false })
  @ApiOperation({ summary: 'Carrito: JWT o header de invitado obligatorio (uno de los dos)' })
  getMine(@CurrentUser() user: AuthenticatedUser | undefined, @GuestSessionHeader() guestSessionId?: string) {
    return this.cart.get(this.resolveOwner(user, guestSessionId));
  }

  @Post('items')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: GUEST_SESSION_HEADER, required: false })
  @ApiOperation({ summary: 'Agregar ítem (usuario o invitado)' })
  add(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @GuestSessionHeader() guestSessionId: string | undefined,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cart.addItem(this.resolveOwner(user, guestSessionId), dto);
  }

  @Patch('items/:itemId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: GUEST_SESSION_HEADER, required: false })
  patchQty(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @GuestSessionHeader() guestSessionId: string | undefined,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItemQuantity(this.resolveOwner(user, guestSessionId), itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: GUEST_SESSION_HEADER, required: false })
  removeItem(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @GuestSessionHeader() guestSessionId: string | undefined,
    @Param('itemId') itemId: string,
  ) {
    return this.cart.removeItem(this.resolveOwner(user, guestSessionId), itemId);
  }

  @Delete()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: GUEST_SESSION_HEADER, required: false })
  clear(@CurrentUser() user: AuthenticatedUser | undefined, @GuestSessionHeader() guestSessionId?: string) {
    return this.cart.clear(this.resolveOwner(user, guestSessionId));
  }

  private resolveOwner(user: AuthenticatedUser | undefined, guestSessionId?: string): CartOwner {
    if (user) {
      return { kind: 'user', userId: user.id };
    }
    if (guestSessionId?.trim()) {
      return { kind: 'guest', guestSessionId: guestSessionId.trim() };
    }
    throw new BadRequestException(
      `Iniciá sesión o enviá ${GUEST_SESSION_HEADER} tras crear sesión en POST /cart/guest-session`,
    );
  }
}
