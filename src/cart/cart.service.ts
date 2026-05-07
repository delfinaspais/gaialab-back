import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          images: { orderBy: { position: 'asc' as const }, take: 1 },
        },
      },
    },
  },
} as const;

export type CartOwner =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; guestSessionId: string };

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async createGuestSession(): Promise<{ guestSessionId: string }> {
    let guestSessionId = randomUUID();
    for (let i = 0; i < 5; i += 1) {
      try {
        await this.prisma.cart.create({
          data: { guestSessionId },
        });
        return { guestSessionId };
      } catch {
        guestSessionId = randomUUID();
      }
    }
    throw new BadRequestException('No se pudo crear sesión de invitado');
  }

  private async getOrCreateByOwner(owner: CartOwner) {
    if (owner.kind === 'user') {
      let cart = await this.prisma.cart.findUnique({
        where: { userId: owner.userId },
        include: cartInclude,
      });
      if (!cart) {
        cart = await this.prisma.cart.create({
          data: { userId: owner.userId },
          include: cartInclude,
        });
      }
      return cart;
    }

    let cart = await this.prisma.cart.findUnique({
      where: { guestSessionId: owner.guestSessionId },
      include: cartInclude,
    });
    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { guestSessionId: owner.guestSessionId },
        include: cartInclude,
      });
    }
    return cart;
  }

  async get(owner: CartOwner) {
    return this.getOrCreateByOwner(owner);
  }

  async addItem(owner: CartOwner, dto: AddCartItemDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, isActive: true, isDeleted: false, isDraft: false },
    });
    if (!product) throw new NotFoundException('Producto no disponible');
    if (product.trackQuantity && product.quantity < dto.quantity) {
      throw new BadRequestException('Stock insuficiente');
    }

    const cart = await this.getOrCreateByOwner(owner);
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
    });

    if (existing) {
      const nextQty = existing.quantity + dto.quantity;
      if (product.trackQuantity && product.quantity < nextQty) {
        throw new BadRequestException('Stock insuficiente');
      }
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQty },
      });
      return this.getOrCreateByOwner(owner);
    }

    await this.prisma.cartItem.create({
      data: { cartId: cart.id, productId: dto.productId, quantity: dto.quantity },
    });
    return this.getOrCreateByOwner(owner);
  }

  async updateItemQuantity(owner: CartOwner, itemId: string, quantity: number) {
    const cart = await this.ensureCart(owner);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      include: { product: true },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado en el carrito');
    if (!item.product.isActive) {
      throw new BadRequestException('Producto no disponible');
    }
    if (item.product.trackQuantity && item.product.quantity < quantity) {
      throw new BadRequestException('Stock insuficiente');
    }
    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
      include: { product: { include: { images: { take: 1, orderBy: { position: 'asc' } } } } },
    });
  }

  async removeItem(owner: CartOwner, itemId: string) {
    const cart = await this.ensureCart(owner);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado');
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getOrCreateByOwner(owner);
  }

  async clear(owner: CartOwner) {
    const cart = await this.ensureCart(owner);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getOrCreateByOwner(owner);
  }

  rawCartForCheckout(owner: CartOwner) {
    if (owner.kind === 'user') {
      return this.prisma.cart.findUnique({
        where: { userId: owner.userId },
        include: {
          items: { include: { product: true } },
        },
      });
    }
    return this.prisma.cart.findUnique({
      where: { guestSessionId: owner.guestSessionId },
      include: {
        items: { include: { product: true } },
      },
    });
  }

  /** Tras login: mezcla carrito invitado en el del usuario y elimina el carrito invitado. */
  async mergeGuestIntoUser(userId: string, guestSessionId: string) {
    const guestCart = await this.prisma.cart.findUnique({
      where: { guestSessionId },
      include: { items: true },
    });
    if (!guestCart?.items.length) {
      return this.getOrCreateByOwner({ kind: 'user', userId });
    }

    const userCart = await this.getOrCreateByOwner({ kind: 'user', userId });

    await this.prisma.$transaction(async (tx) => {
      for (const line of guestCart.items) {
        const product = await tx.product.findFirst({
          where: { id: line.productId, isActive: true, isDeleted: false, isDraft: false },
        });
        if (!product) continue;

        const existing = await tx.cartItem.findUnique({
          where: { cartId_productId: { cartId: userCart.id, productId: line.productId } },
        });
        const cap = product.trackQuantity ? product.quantity : Number.MAX_SAFE_INTEGER;
        if (existing) {
          const next = Math.min(existing.quantity + line.quantity, cap);
          await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: next } });
        } else {
          const qty = Math.min(line.quantity, cap);
          if (qty > 0) {
            await tx.cartItem.create({
              data: { cartId: userCart.id, productId: line.productId, quantity: qty },
            });
          }
        }
      }
      await tx.cartItem.deleteMany({ where: { cartId: guestCart.id } });
      await tx.cart.delete({ where: { id: guestCart.id } });
    });

    return this.getOrCreateByOwner({ kind: 'user', userId });
  }

  private async ensureCart(owner: CartOwner) {
    const cart =
      owner.kind === 'user'
        ? await this.prisma.cart.findUnique({ where: { userId: owner.userId } })
        : await this.prisma.cart.findUnique({ where: { guestSessionId: owner.guestSessionId } });
    if (!cart) throw new NotFoundException('Carrito no encontrado');
    return cart;
  }
}
