import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';

export const EVENTS_EXCHANGE = 'micromart.events';

type EventHandler = (routingKey: string, payload: any) => Promise<void>;

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqp.ChannelModel | undefined;
  private channel: amqp.Channel | undefined;

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async connectWithRetry(attempt = 1): Promise<void> {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed, retrying...');
        void this.connectWithRetry();
      });
      this.logger.log('Connected to RabbitMQ');
    } catch (error) {
      const delayMs = Math.min(1000 * attempt, 10_000);
      this.logger.warn(
        `RabbitMQ connection failed (${(error as Error).message}); retrying in ${delayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await this.connectWithRetry(attempt + 1);
    }
  }

  /** Publishes a saga event. routingKey should match the dot-notation event names, e.g. "stock.reserved". */
  publish(routingKey: string, payload: unknown) {
    if (!this.channel) {
      this.logger.warn(`Dropped event ${routingKey}: no RabbitMQ channel available`);
      return;
    }
    this.channel.publish(
      EVENTS_EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true, contentType: 'application/json' },
    );
  }

  /** Binds `queue` to the given routing keys on the shared topic exchange and consumes it. */
  async consume(queue: string, routingKeys: string[], handler: EventHandler) {
    while (!this.channel) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const channel = this.channel;
    await channel.assertQueue(queue, { durable: true });
    for (const key of routingKeys) {
      await channel.bindQueue(queue, EVENTS_EXCHANGE, key);
    }
    await channel.prefetch(10);
    await channel.consume(queue, (msg) => {
      if (!msg) return;
      void (async () => {
        try {
          const payload = JSON.parse(msg.content.toString());
          await handler(msg.fields.routingKey, payload);
          channel.ack(msg);
        } catch (error) {
          this.logger.error(
            `Failed to process ${msg.fields.routingKey}: ${(error as Error).message}`,
          );
          // Don't requeue immediately — avoids a hot loop on a permanently-broken message.
          channel.nack(msg, false, false);
        }
      })();
    });
    this.logger.log(`Consuming queue "${queue}" bound to [${routingKeys.join(', ')}]`);
  }
}
