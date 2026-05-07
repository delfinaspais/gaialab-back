import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] | Record<string, unknown> = 'Internal server error';
    if (isHttp) {
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : (body as { message?: string | string[] }).message ?? exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const payload = {
      statusCode: status,
      path: req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
      message,
    };

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(payload);
  }
}
