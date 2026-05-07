import { Injectable } from '@nestjs/common';
import { InventoryLogType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    tx: Prisma.TransactionClient | PrismaService,
    params: {
      productId: string;
      type: InventoryLogType;
      quantity: number;
      reason?: string | null;
      reference?: string | null;
      userId?: string | null;
    },
  ) {
    await tx.inventoryLog.create({
      data: {
        productId: params.productId,
        type: params.type,
        quantity: Math.abs(params.quantity),
        reason: params.reason,
        reference: params.reference,
        userId: params.userId ?? undefined,
      },
    });
  }

  /** Venta / salida por orden de compra */
  async recordOutSale(
    tx: Prisma.TransactionClient,
    params: { productId: string; quantity: number; reference: string },
  ) {
    await this.record(tx, {
      ...params,
      type: InventoryLogType.OUT,
      reason: 'Venta',
    });
  }
}
