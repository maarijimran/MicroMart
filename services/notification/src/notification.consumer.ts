import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { orderOutcomeEventSchema } from './notification.schemas';
import { NotificationService } from './notification.service';
import { RabbitMqService } from './rabbitmq.service';
import { RedisService } from './redis.service';

const QUEUE = 'notification.saga';
const ROUTING_KEYS = ['order.confirmed', 'order.cancelled'];
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;

/**
 * The last stop in the choreographed checkout saga. Nothing downstream
 * reacts to anything this service does — it only ever consumes.
 */
@Injectable()
export class NotificationConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitMqService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.consume(QUEUE, ROUTING_KEYS, async (routingKey, payload) => {
      const parsed = orderOutcomeEventSchema.safeParse(payload);
      if (!parsed.success) {
        this.logger.warn(`Ignoring malformed ${routingKey} event: ${parsed.error.message}`);
        return;
      }

      const isNew = await this.redis.setIfAbsent(
        `processed:${parsed.data.orderId}:${routingKey}`,
        IDEMPOTENCY_TTL_SECONDS,
      );
      if (!isNew) {
        this.logger.log(`Already processed ${routingKey} for order ${parsed.data.orderId} — skipping.`);
        return;
      }

      await this.notifications.notify(routingKey as 'order.confirmed' | 'order.cancelled', parsed.data);
    });
  }
}
