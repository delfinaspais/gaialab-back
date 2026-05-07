import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GUEST_ORDER_TOKEN_HEADER, GUEST_SESSION_HEADER } from './common/constants/http-headers';
import { AppModule } from './app.module';

function buildCorsOrigins(): (string | RegExp)[] {
  const pub = process.env.PUBLIC_SITE_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const admin = process.env.ADMIN_SITE_URL?.trim();
  const extra =
    process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const set = new Set<string>([pub, ...extra, ...(admin ? [admin] : [])]);
  const list = [...set].filter((s) => s.length > 0);
  return [...list, /^https?:\/\/localhost(:\d+)?$/];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: buildCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', GUEST_SESSION_HEADER, GUEST_ORDER_TOKEN_HEADER],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GaiaLab E-commerce API')
    .setDescription(
      'Backend e-commerce objetos 3D. Sitio público + panel admin en otro origen CORS; carrito/checkout como invitado o con cuenta; OAuth Google.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
