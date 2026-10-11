import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const port = process.env.PORT || 4000;
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows inline media previews
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Cookie parser
  app.use(cookieParser(process.env.COOKIE_SECRET || 'previa_cookie_salt_2026'));

  // CORS
  app.enableCors({
    origin: [corsOrigin, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition'],
  });

  // Global API Prefix
  app.setGlobalPrefix('api/v1');

  // Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(port);
  logger.log(`Previa Backend API is running on: http://localhost:${port}/api/v1`);
}

bootstrap();
