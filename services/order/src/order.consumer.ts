import { Injectable, OnModuleInit } from '@nestjs/common';
import { OrderService } from './order.service';
import { RabbitMqService } from './rabbitmq.service';

@Injectable()
export class OrderConsumer implements OnModuleInit {
  constructor(private readonly rabbitmq: RabbitMqService, private readonly orders: OrderService) {}

  async onModuleInit() {
    await this.rabbitmq.consume('order.saga', ['stock.reserved', 'stock.reservation_failed', 'payment.succeeded', 'payment.failed'], async (eventType, payload) => {
      await this.orders.consumeSagaEvent(eventType as 'stock.reserved' | 'stock.reservation_failed' | 'payment.succeeded' | 'payment.failed', payload);
    });
  }
}
