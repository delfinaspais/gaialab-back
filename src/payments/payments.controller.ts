import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { GUEST_ORDER_TOKEN_HEADER } from '../common/constants/http-headers';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GuestOrderTokenHeader } from '../common/decorators/guest-order-token.decorator';
import { AuthenticatedUser } from '../common/interfaces/express-user.interface';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('preference/:orderId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: GUEST_ORDER_TOKEN_HEADER, required: false, description: 'Obligatorio para órdenes de invitado' })
  @ApiOperation({ summary: 'Preferencia Checkout Pro (JWT o token de invitado)' })
  createPreference(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @GuestOrderTokenHeader() guestToken: string | undefined,
  ) {
    return this.payments.createCheckoutPreference(orderId, { user, guestAccessToken: guestToken });
  }

  @Post('webhook')
  @ApiExcludeEndpoint()
  async webhook(@Req() req: Request) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const query = req.query as Record<string, string | undefined>;

    let dataId: string | undefined = query?.id ?? query?.['data.id'];
    let topic: string | undefined = query?.topic;

    if (!dataId || !topic) {
      if (
        typeof body?.type === 'string' &&
        body.type === 'payment' &&
        body.data &&
        typeof body.data === 'object'
      ) {
        const d = body.data as { id?: string };
        dataId = d.id?.toString();
        topic = 'payment';
      } else if (typeof body?.topic === 'string' && typeof body?.resource === 'string') {
        topic = body.topic.includes('/') ? body.topic.split('/')[0] : body.topic;
        const resource = String(body.resource);
        const m = resource.match(/(\d+)\s*$/);
        dataId = dataId ?? m?.[1];
      }
    }

    return this.payments.processWebhookNotification(dataId, topic === 'payments' ? 'payment' : topic);
  }
}
