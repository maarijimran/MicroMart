import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { reserveItemsSchema } from './catalog.schemas';
import { RabbitMqService } from './rabbitmq.service';
import { RedisService } from './redis.service';

const QUEUE = 'catalog.saga';
const ROUTING_KEYS = ['order.created', 'order.cancelled', 'order.payment_failed'];
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;

/**
 * The Catalog side of the choreographed checkout saga. No orchestrator here —
 * this consumer only reacts to events Order Service publishes and publishes
 * its own outcome events in response. See the project brief, section 5.
 */
@Injectable()
export class CatalogConsumer implements OnModuleInit {
  private readonly logger = new Logger(CatalogConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitMqService,
    private readonly redis: RedisService,
    private readonly catalog: CatalogService,
  ) { }

  async onModuleInit() {
    await this.rabbitmq.consume(QUEUE, ROUTING_KEYS, async (routingKey, payload) => {
      const orderId: string | undefined = payload?.orderId;
      if (!orderId) {
        this.logger.warn(`Ignoring ${routingKey} event with no orderId.`);
        return;
      }

      // RabbitMQ delivers at-least-once — this is the cheap first idempotency
      // check before touching Postgres. The DB-level unique constraint on
      // (orderId, productId) is the correctness backstop behind it.
      const isNew = await this.redis.setIfAbsent(
        `processed:${orderId}:${routingKey}`,
        IDEMPOTENCY_TTL_SECONDS,
      );
      if (!isNew) {
        this.logger.log(`Already processed ${routingKey} for order ${orderId} — skipping.`);
        return;
      }

      switch (routingKey) {
        case 'order.created': {
          const parsed = reserveItemsSchema.safeParse(payload);
          if (!parsed.success) {
            this.logger.warn(`Ignoring malformed order.created event for ${orderId}: ${parsed.error.message}`);
            return;
          }

          await this.catalog.reserveStockForOrder(
            parsed.data.orderId,
            parsed.data.userId,
            parsed.data.totalAmount,
            parsed.data.currency,
            parsed.data.items,
          );

          break;
        }
        case 'order.cancelled':
        case 'order.payment_failed':
          await this.catalog.releaseReservationsForOrder(orderId);
          break;
      }
    });
  }
}
