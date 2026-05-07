import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CartOwner, CartService } from '../cart/cart.service';
import { CheckoutCartContext } from './orders-context';
import { assertGuestOrderToken } from './guest-order.util';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly inventory: InventoryService,
  ) {}

  async checkout(ctx: CheckoutCartContext, dto: CreateOrderDto) {
    const owner: CartOwner =
      'userId' in ctx
        ? { kind: 'user', userId: ctx.userId }
        : { kind: 'guest', guestSessionId: ctx.guestSessionId };

    if (owner.kind === 'guest' && !dto.guestEmail?.trim()) {
      throw new BadRequestException('guestEmail es obligatorio para comprar sin cuenta');
    }

    const cart = await this.cartService.rawCartForCheckout(owner);
    if (!cart?.items.length) {
      throw new BadRequestException('El carrito está vacío');
    }

    let subtotal = new Prisma.Decimal(0);
    const lines: {
      productId: string;
      quantity: number;
      priceAtPurchase: Prisma.Decimal;
      productName: string;
    }[] = [];

    for (const line of cart.items) {
      const p = line.product;
      if (!p.isActive || p.isDeleted || p.isDraft) {
        throw new BadRequestException(`Producto fuera de catálogo: ${p.name}`);
      }
      if (p.trackQuantity && p.quantity < line.quantity) {
        throw new BadRequestException(`Stock insuficiente: ${p.name}`);
      }
      const unit = p.price;
      const lineTotal = unit.mul(line.quantity);
      subtotal = subtotal.add(lineTotal);
      lines.push({
        productId: p.id,
        quantity: line.quantity,
        priceAtPurchase: unit,
        productName: p.name,
      });
    }

    const shipping = new Prisma.Decimal(dto.shippingCost ?? 0);
    const total = subtotal.add(shipping);

    const guestAccessToken = owner.kind === 'guest' ? this.newGuestAccessToken() : undefined;

    const orderRow = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId: owner.kind === 'user' ? owner.userId : undefined,
          guestEmail: owner.kind === 'guest' ? dto.guestEmail!.trim().toLowerCase() : undefined,
          guestAccessToken,
          status: OrderStatus.PENDING,
          subtotal,
          shippingCost: shipping,
          total,
          shippingName: dto.shippingName,
          shippingPhone: dto.shippingPhone,
          shippingStreet: dto.shippingStreet,
          shippingCity: dto.shippingCity,
          shippingState: dto.shippingState,
          shippingZip: dto.shippingZip,
          shippingCountry: dto.shippingCountry ?? 'AR',
          notes: dto.notes,
          items: {
            createMany: {
              data: lines.map((l) => ({
                productId: l.productId,
                quantity: l.quantity,
                priceAtPurchase: l.priceAtPurchase,
                productName: l.productName,
              })),
            },
          },
        },
        include: { items: true, user: { select: { id: true, email: true, name: true } } },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return order;
    });

    if (guestAccessToken) {
      return { order: orderRow, guestAccessToken };
    }
    return { order: orderRow };
  }

  private newGuestAccessToken(): string {
    return randomBytes(32).toString('hex');
  }

  async findMine(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: { include: { images: { take: 1 } } } } } },
    });
  }

  async findOneForUser(orderId: string, userId: string, role: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: { select: { id: true, email: true, name: true } } },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (role !== 'ADMIN') {
      if (!order.userId || order.userId !== userId) {
        throw new ForbiddenException();
      }
    }
    return order;
  }

  async findOneAsGuest(orderId: string, guestAccessToken: string | undefined) {
    if (!guestAccessToken?.trim()) {
      throw new BadRequestException('Falta token de acceso de invitado');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: { select: { id: true, email: true, name: true } } },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    assertGuestOrderToken(order.guestAccessToken, guestAccessToken.trim());
    return order;
  }

  /**
   * Pago Checkout Pro o consulta administrativa con token de invitado.
   */
  async findOrderForPayment(
    orderId: string,
    opts: {
      userId?: string;
      role: string;
      guestAccessToken?: string;
    },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');

    if (opts.role === 'ADMIN') {
      return order;
    }

    if (order.userId) {
      if (order.userId !== opts.userId) {
        throw new ForbiddenException();
      }
      return order;
    }

    assertGuestOrderToken(order.guestAccessToken, opts.guestAccessToken);
    return order;
  }

  findAllAdmin(filters?: { status?: OrderStatus }) {
    return this.prisma.order.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } }, items: true },
    });
  }

  async updateStatusAdmin(orderId: string, status: OrderStatus, andreani?: { tracking?: string; shipmentId?: string }) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(andreani?.tracking ? { andreaniTrackingNumber: andreani.tracking } : {}),
        ...(andreani?.shipmentId ? { andreaniShipmentId: andreani.shipmentId } : {}),
      },
      include: { items: true, user: { select: { email: true, name: true } } },
    });
  }

  attachMercadoPagoPreference(orderId: string, preferenceId: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { mercadopagoPreferenceId: preferenceId },
    });
  }

  async markPaidFromWebhook(params: {
    orderId: string;
    paymentId: string;
    paymentStatus?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        include: { items: true },
      });
      if (!order) {
        throw new NotFoundException('Orden no encontrada');
      }
      if (order.status !== OrderStatus.PENDING) {
        return order;
      }
      if (order.mercadopagoPaymentId === params.paymentId) {
        return order;
      }

      await tx.order.update({
        where: { id: params.orderId },
        data: {
          mercadopagoPaymentId: params.paymentId,
          mercadopagoStatus: params.paymentStatus ?? 'approved',
          status: OrderStatus.PROCESSING,
        },
      });

      for (const item of order.items) {
        const p = await tx.product.findUnique({ where: { id: item.productId } });
        if (!p) {
          throw new BadRequestException(`Producto inexistente en orden: ${item.productId}`);
        }
        if (p.trackQuantity && p.quantity < item.quantity) {
          throw new BadRequestException(`Stock insuficiente al confirmar pago: ${p.name}`);
        }
        if (p.trackQuantity) {
          await tx.product.update({
            where: { id: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
          await this.inventory.recordOutSale(tx, {
            productId: item.productId,
            quantity: item.quantity,
            reference: params.orderId,
          });
        }
      }

      return tx.order.findUnique({
        where: { id: params.orderId },
        include: { items: true },
      });
    });
  }
}
