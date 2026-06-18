import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { RequestIdMiddleware } from './common/errors/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false, bodyParser: false });

  // Raised limit so base64 photo uploads (POST /files) fit comfortably — raw
  // Aadhaar-card captures are larger; the server re-compresses before storing.
  app.use(json({ limit: '16mb' }));
  app.use(urlencoded({ extended: true, limit: '16mb' }));

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(RequestIdMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '*').split(','),
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('CLAMS API')
    .setDescription('Construction Labour Attendance Management System')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Device-Id', in: 'header' }, 'device')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`CLAMS API listening on :${port}`);
}
bootstrap();
