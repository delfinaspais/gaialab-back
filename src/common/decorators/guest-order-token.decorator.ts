import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GUEST_ORDER_TOKEN_HEADER } from '../constants/http-headers';

export const GuestOrderTokenHeader = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
  const v = req.headers[GUEST_ORDER_TOKEN_HEADER];
  if (Array.isArray(v)) return v[0]?.trim();
  return typeof v === 'string' ? v.trim() : undefined;
});
