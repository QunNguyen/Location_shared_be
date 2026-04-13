import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // ─── Generic ─────────────────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(key, ttlSeconds);
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  async incrBy(key: string, increment: number): Promise<number> {
    return this.redis.incrby(key, increment);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.set(key, serialized, ttlSeconds);
  }

  // ─── Online Status ───────────────────────────────────────────────────────

  async setOnline(userId: string): Promise<void> {
    await this.redis.set(`online:${userId}`, '1');
  }

  async setOffline(userId: string): Promise<void> {
    await this.redis.del(`online:${userId}`);
  }

  async isOnline(userId: string): Promise<boolean> {
    return this.exists(`online:${userId}`);
  }

  async getOnlineUsers(userIds: string[]): Promise<string[]> {
    if (!userIds.length) return [];
    const pipeline = this.redis.pipeline();
    userIds.forEach((id) => pipeline.get(`online:${id}`));
    const results = await pipeline.exec();
    return userIds.filter((_, i) => results[i]?.[1] === '1');
  }

  // ─── Unread Count ────────────────────────────────────────────────────────

  async getUnreadCount(userId: string, conversationId: string): Promise<number> {
    const val = await this.redis.get(`unread:${userId}:${conversationId}`);
    return parseInt(val || '0', 10);
  }

  async incrementUnread(userId: string, conversationId: string): Promise<void> {
    await this.redis.incr(`unread:${userId}:${conversationId}`);
  }

  async resetUnread(userId: string, conversationId: string): Promise<void> {
    await this.redis.del(`unread:${userId}:${conversationId}`);
  }

  async getTotalUnread(userId: string): Promise<number> {
    const keys = await this.redis.keys(`unread:${userId}:*`);
    if (!keys.length) return 0;
    const values = await this.redis.mget(...keys);
    return values.reduce((sum, v) => sum + parseInt(v || '0', 10), 0);
  }

  // ─── Cache helpers ───────────────────────────────────────────────────────

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length) {
      await this.redis.del(...keys);
    }
  }
}
