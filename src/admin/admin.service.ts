import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [
      users,
      customers,
      products,
      ordersByStatus,
      revenueAgg,
      recentOrders,
      lowProducts,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
      this.prisma.product.count({ where: { isDeleted: false } }),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: { in: [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
        },
        _sum: { total: true },
      }),
      this.prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, name: true } }, items: { take: 3 } },
      }),
      this.prisma.product.findMany({
        where: { isActive: true, isDeleted: false, trackQuantity: true },
        take: 200,
      }),
    ]);

    const lowStock = lowProducts.filter(
      (p) => p.quantity <= (p.lowStockThreshold ?? 5),
    );

    const ordersCounts = ordersByStatus.reduce(
      (acc, row) => {
        acc[row.status] = row._count.status;
        return acc;
      },
      {} as Partial<Record<OrderStatus, number>>,
    );

    return {
      totals: {
        users,
        customers,
        products,
        revenue: revenueAgg._sum.total ?? new Prisma.Decimal(0),
        ordersPending: ordersCounts.PENDING ?? 0,
      },
      ordersByStatus: ordersCounts,
      recentOrders,
      inventory: {
        lowStockCount: lowStock.length,
        lowStockProducts: lowStock.slice(0, 20),
      },
    };
  }
}
