import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import kafkaConfig from './config/kafka.config';
import minioConfig from './config/minio.config';
import { winstonConfig } from './config/winston.config';
import { RedisModule } from './shared/redis/redis.module';
import { KafkaModule } from './shared/kafka/kafka.module';
import { MinioModule } from './shared/minio/minio.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { PostModule } from './modules/post/post.module';
import { ReviewModule } from './modules/review/review.module';
import { CommentModule } from './modules/comment/comment.module';
import { ChatModule } from './modules/chat/chat.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig, kafkaConfig, minioConfig],
      envFilePath: ['.env'],
    }),

    // Logger
    WinstonModule.forRoot(winstonConfig),

    // MongoDB
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('database.uri'),
        retryAttempts: 5,
        retryDelay: 3000,
      }),
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: parseInt(process.env.THROTTLE_TTL) || 60000,
          limit: parseInt(process.env.THROTTLE_LIMIT) || 60,
        },
      ],
    }),

    // Shared
    RedisModule,
    KafkaModule,
    MinioModule,

    // Feature Modules
    AuthModule,
    UserModule,
    PostModule,
    ReviewModule,
    CommentModule,
    ChatModule,
  ],
})
export class AppModule {}
