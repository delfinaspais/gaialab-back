import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Role } from '@prisma/client';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { AuthenticatedUser } from '../common/interfaces/express-user.interface';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
  ) {}

  private mpClient() {
    const token = this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    if (!token) {
      throw new BadRequestException('Mercado Pago no está configurado');
    }
    return new MercadoPagoConfig({ accessToken: token });
  }

  async createCheckoutPreference(
    orderId: string,
    opts: { user?: AuthenticatedUser; guestAccessToken?: string },
  ) {
    if (!opts.user && !opts.guestAccessToken?.trim()) {
      throw new ForbiddenException('Enviá JWT o el header de token de orden de invitado');
    }

    const roleStr = opts.user?.role === Role.ADMIN ? 'ADMIN' : 'CUSTOMER';

    const order = await this.orders.findOrderForPayment(orderId, {
      userId: opts.user?.id,
      role: roleStr,
      guestAccessToken: opts.guestAccessToken?.trim(),
    });

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('La orden no está pendiente de pago');
    }
    if (order.mercadopagoPreferenceId) {
      return { preferenceId: order.mercadopagoPreferenceId, alreadyCreated: true };
    }

    const frontend = this.config.get<string>('PUBLIC_SITE_URL') ?? this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';

    const backendPublic = this.config.get<string>('BACKEND_PUBLIC_URL') ?? 'http://localhost:3000';

    const client = this.mpClient();
    const preference = new Preference(client);

    const items = order.items.map((i) => ({
      id: i.productId,
      title: i.productName,
      quantity: i.quantity,
      unit_price: Number(i.priceAtPurchase),
      currency_id: 'ARS',
    }));

    const webhookUrl = `${backendPublic.replace(/\/$/, '')}/api/payments/webhook`;

    const body = {
      items,
      external_reference: order.id,
      back_urls: {
        success: `${frontend.replace(/\/$/, '')}/pago/exito`,
        failure: `${frontend.replace(/\/$/, '')}/pago/error`,
        pending: `${frontend.replace(/\/$/, '')}/pago/pendiente`,
      },
      auto_return: 'approved' as const,
      notification_url: webhookUrl,
      metadata: {
        orderId: order.id,
        userId: order.userId ?? '',
        isGuest: order.userId ? '0' : '1',
      },
    };

    const result = await preference.create({ body });
    await this.orders.attachMercadoPagoPreference(order.id, String(result.id));

    const initPoint =
      typeof result.init_point === 'string' && result.init_point.length
        ? result.init_point
        : (result as { sandbox_init_point?: string }).sandbox_init_point ?? '';

    return { preferenceId: result.id, initPoint: initPoint || undefined };
  }

  async processWebhookNotification(dataId?: string, topic?: string) {
    if (!dataId || topic !== 'payment') {
      this.logger.verbose(`Webhook ignorado topic=${topic} id=${dataId}`);
      return { ok: true, ignored: true };
    }

    const client = this.mpClient();
    const paymentApi = new Payment(client);

    let payment;
    try {
      payment = await paymentApi.get({ id: dataId });
    } catch (e) {
      this.logger.error(`No se pudo obtener pago ${dataId}`, e instanceof Error ? e.stack : e);
      throw new NotFoundException('Pago no encontrado en Mercado Pago');
    }

    const ref = payment.external_reference;
    if (!ref) {
      this.logger.warn(`Pago ${dataId} sin external_reference`);
      return { ok: false, reason: 'no_external_reference' };
    }

    const status = payment.status;
    if (status === 'approved') {
      await this.orders.markPaidFromWebhook({
        orderId: ref,
        paymentId: String(payment.id ?? dataId),
        paymentStatus: status,
      });
      return { ok: true, processed: 'approved' };
    }

    this.logger.log(`Pago ${dataId} estado ${status} — sin descuento de stock`);
    return { ok: true, processed: status ?? 'unknown' };
  }
}
