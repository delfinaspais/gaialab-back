import { ForbiddenException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

export function assertGuestOrderToken(stored: string | null | undefined, provided: string | undefined): void {
  if (!stored || !provided || stored.length !== provided.length) {
    throw new ForbiddenException();
  }
  const a = Buffer.from(stored, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ForbiddenException();
  }
}
