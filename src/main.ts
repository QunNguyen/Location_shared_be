import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { winstonConfig } from './config/winston.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RedisIoAdapter } from './shared/redis/redis-io.adapter';

async function bootstrap() {
  const logger = WinstonModule.createLogger(winstonConfig);

  const app = await NestFactory.create(AppModule, { logger });

  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Interceptors
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Location Shared API')
    .setDescription(
      'Production-ready Location Sharing Backend — NestJS + Socket.IO + Redis + Kafka + MinIO',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'access-token',
    )
    .addTag('Auth', 'Authentication & authorization')
    .addTag('Users', 'User profile management')
    .addTag('Posts', 'Travel location posts')
    .addTag('Reviews', 'Location reviews & ratings')
    .addTag('Comments', 'Post comments (nested)')
    .addTag('Chat', 'Conversations & messaging (REST)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Location Shared API Docs',
  });

  // Redis Socket.IO Adapter (for horizontal scaling across multiple instances)
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);

  logger.log(`🚀 Server running on: http://localhost:${port}`, 'Bootstrap');
  logger.log(`📚 Swagger docs: http://localhost:${port}/api`, 'Bootstrap');
  logger.log(`🔌 Socket.IO: ws://localhost:${port}/chat`, 'Bootstrap');
  logger.log(`🪣 MinIO Console: http://localhost:9001`, 'Bootstrap');
}

bootstrap();
