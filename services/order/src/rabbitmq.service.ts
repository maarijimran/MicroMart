import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';

export const EVENTS_EXCHANGE = 'micromart.events';
type EventHandler = (routingKey: string, payload: Record<string, unknown>) => Promise<void>;

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;

  async onModuleInit() { await this.connectWithRetry(); }
  async onModuleDestroy() { await this.channel?.close(); await this.connection?.close(); }

  private async connectWithRetry(attempt = 1): Promise<void> {
    try {
      this.connection = await amqp.connect(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672');
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
      this.connection.on('close', () => { this.channel = undefined; void this.connectWithRetry(); });
      this.logger.log('Connected to RabbitMQ');
    } catch (error) {
      const delay = Math.min(attempt * 1000, 10_000);
      this.logger.warn(`RabbitMQ connection failed (${(error as Error).message}); retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      await this.connectWithRetry(attempt + 1);
    }
  }

  publish(routingKey: string, payload: unknown) {
    if (!this.channel) throw new Error(`Cannot publish ${routingKey}: RabbitMQ is unavailable.`);
    this.channel.publish(EVENTS_EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true, contentType: 'application/json',
    });
  }

  async consume(queue: string, routingKeys: string[], handler: EventHandler) {
    while (!this.channel) await new Promise((resolve) => setTimeout(resolve, 250));
    const channel = this.channel;
    await channel.assertQueue(queue, { durable: true });
    for (const key of routingKeys) await channel.bindQueue(queue, EVENTS_EXCHANGE, key);
    await channel.prefetch(10);
    await channel.consume(queue, (message) => {
      if (!message) return;
      void (async () => {
        try {
          await handler(message.fields.routingKey, JSON.parse(message.content.toString()));
          channel.ack(message);
        } catch (error) {
          this.logger.error(`Failed to process ${message.fields.routingKey}: ${(error as Error).message}`);
          channel.nack(message, false, false);
        }
      })();
    });
    this.logger.log(`Consuming queue "${queue}" bound to [${routingKeys.join(', ')}]`);
  }
}
