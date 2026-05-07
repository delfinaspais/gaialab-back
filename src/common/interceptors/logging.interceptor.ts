import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<{ statusCode: number }>();
          const ms = Date.now() - started;
          this.logger.log(`${method} ${url} ${res.statusCode} ${ms}ms`);
        },
        error: (err: Error & { status?: number }) => {
          const ms = Date.now() - started;
          this.logger.warn(`${method} ${url} ${err?.status ?? '?'} ${ms}ms — ${err?.message}`);
        },
      }),
    );
  }
}
