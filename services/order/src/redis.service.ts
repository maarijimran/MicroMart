import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true, maxRetriesPerRequest: 2,
  });

  async onModuleInit() { await this.client.connect(); }
  async onModuleDestroy() { await this.client.quit(); }
  get(key: string) { return this.client.get(key); }
  del(key: string) { return this.client.del(key); }
  async setIfAbsent(key: string, value: string, seconds: number) {
    return (await this.client.set(key, value, 'EX', seconds, 'NX')) === 'OK';
  }
  setFor(key: string, value: string, seconds: number) { return this.client.set(key, value, 'EX', seconds); }
}
