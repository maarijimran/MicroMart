import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  get(key: string) {
    return this.client.get(key);
  }

  del(key: string) {
    return this.client.del(key);
  }

  async incrementWithExpiry(key: string, seconds: number) {
    const pipeline = this.client.multi();
    pipeline.incr(key);
    pipeline.expire(key, seconds);
    const result = await pipeline.exec();
    return Number(result?.[0]?.[1] ?? 0);
  }

  setFor(key: string, value: string, seconds: number) {
    return this.client.set(key, value, 'EX', seconds);
  }

  /** Returns true only the first time this key is set — used for idempotency checks. */
  async setIfAbsent(key: string, seconds: number) {
    const result = await this.client.set(key, '1', 'EX', seconds, 'NX');
    return result === 'OK';
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  setJSON(key: string, value: unknown, seconds: number) {
    return this.client.set(key, JSON.stringify(value), 'EX', seconds);
  }
}
