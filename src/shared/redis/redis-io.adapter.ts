/**
 * Redis Adapter bootstrap helper for Socket.IO scale-out.
 * Call this in main.ts AFTER creating the NestJS app.
 *
 * Usage:
 *   const ioAdapter = new RedisIoAdapter(app);
 *   await ioAdapter.connectToRedis();
 *   app.useWebSocketAdapter(ioAdapter);
 */

import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class RedisIoAdapter extends IoAdapter {
  private static adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(private app: INestApplication) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const configService = this.app.get(ConfigService);

    const redisOptions = {
      host: configService.get<string>('redis.host', 'localhost'),
      port: configService.get<number>('redis.port', 6379),
      password: configService.get<string>('redis.password') || undefined,
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
    };

    const pubClient = new Redis(redisOptions);
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) =>
      this.logger.error('Redis pub client error', err.message),
    );
    subClient.on('error', (err) =>
      this.logger.error('Redis sub client error', err.message),
    );

    await Promise.all([
      new Promise<void>((resolve) => pubClient.once('ready', resolve)),
      new Promise<void>((resolve) => subClient.once('ready', resolve)),
    ]);

    RedisIoAdapter.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Socket.IO Redis adapter ready');
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: '*', credentials: true },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    server.adapter(RedisIoAdapter.adapterConstructor);
    return server;
  }
}
