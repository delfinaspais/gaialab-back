import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

const OPT_KEY = 'optionalJwtSkipped';

/**
 * Si no hay `Authorization: Bearer`, deja pasar sin `req.user`.
 * Si hay Bearer, valida el JWT como JwtAuthGuard.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      [OPT_KEY]?: boolean;
    }>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      req[OPT_KEY] = true;
      return true;
    }
    req[OPT_KEY] = false;
    return super.canActivate(context);
  }

  override handleRequest<TUser>(err: Error | undefined, user: TUser, _info: unknown, context: ExecutionContext): TUser {
    const req = context.switchToHttp().getRequest<{ [OPT_KEY]?: boolean }>();
    if (req[OPT_KEY]) {
      return undefined as TUser;
    }
    if (err || !user) {
      throw err ?? new UnauthorizedException('Token inválido o expirado');
    }
    return user;
  }
}
