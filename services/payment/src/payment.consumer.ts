import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { stockReservedEventSchema } from './payment.schemas';
import { RabbitMqService } from './rabbitmq.service';
import { RedisService } from './redis.service';

const QUEUE = 'payment.saga';
const ROUTING_KEYS = ['stock.reserved'];
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;

/**
 * The Payment side of the choreographed checkout saga. Only reacts to
 * stock.reserved — Payment has no compensating action of its own, it either
 * succeeds or fails outright (see the project brief, section 5).
 */
@Injectable()
export class PaymentConsumer implements OnModuleInit {
  private readonly logger = new Logger(PaymentConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitMqService,
    private readonly redis: RedisService,
    private readonly payments: PaymentService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.consume(QUEUE, ROUTING_KEYS, async (routingKey, payload) => {
      const parsed = stockReservedEventSchema.safeParse(payload);
      if (!parsed.success) {
        this.logger.warn(`Ignoring malformed ${routingKey} event: ${parsed.error.message}`);
        return;
      }

      // RabbitMQ delivers at-least-once — this is the cheap first idempotency
      // check before touching Postgres. The unique constraint on
      // payments.order_id is the correctness backstop behind it.
      const isNew = await this.redis.setIfAbsent(
        `processed:${parsed.data.orderId}:${routingKey}`,
        IDEMPOTENCY_TTL_SECONDS,
      );
      if (!isNew) {
        this.logger.log(`Already processed ${routingKey} for order ${parsed.data.orderId} — skipping.`);
        return;
      }

      await this.payments.processReservation(parsed.data);
    });
  }
}
