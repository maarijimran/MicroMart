import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { CatalogClient } from './catalog.client';
import { CreateOrderInput, ListOrdersQuery } from './order.schemas';
import { PrismaService } from './prisma.service';
import { RabbitMqService } from './rabbitmq.service';
import { RedisService } from './redis.service';

const IDEMPOTENCY_TTL_SECONDS = Number(process.env.IDEMPOTENCY_TTL_SECONDS ?? 86_400);

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogClient,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMqService,
  ) {}

  async createOrder(userId: string, input: CreateOrderInput, idempotencyKey?: string) {
    const key = idempotencyKey ? `idempotency:${userId}:${idempotencyKey}` : undefined;
    if (key) {
      const existingId = await this.redis.get(key);
      if (existingId && existingId !== 'pending') return this.getOrder(existingId, userId, 'customer');
      if (existingId === 'pending') throw new ConflictException('An order with this Idempotency-Key is already being created.');
      if (!(await this.redis.setIfAbsent(key, 'pending', IDEMPOTENCY_TTL_SECONDS))) {
        const racedId = await this.redis.get(key);
        if (racedId && racedId !== 'pending') return this.getOrder(racedId, userId, 'customer');
        throw new ConflictException('An order with this Idempotency-Key is already being created.');
      }
    }

    try {
      const products = await Promise.all(input.items.map((item) => this.catalog.getProduct(item.productId)));
      const snapshots = input.items.map((item, index) => {
        const product = products[index];
        if (!product || !product.isActive) throw new NotFoundException(`Product ${item.productId} is unavailable.`);
        if (product.currency.length !== 3) throw new ConflictException(`Product ${item.productId} has an invalid currency.`);
        const unitPrice = new Prisma.Decimal(product.price);
        return { productId: item.productId, productNameSnapshot: product.name, unitPriceSnapshot: unitPrice, quantity: item.quantity, subtotal: unitPrice.mul(item.quantity), currency: product.currency };
      });
      const currency = snapshots[0].currency;
      if (snapshots.some((item) => item.currency !== currency)) throw new ConflictException('All order items must use the same currency.');
      const totalAmount = snapshots.reduce((total, item) => total.add(item.subtotal), new Prisma.Decimal(0));

      const order = await this.prisma.order.create({
        data: {
          userId, totalAmount, currency,
          items: { create: snapshots.map(({ currency: _currency, ...item }) => item) },
        },
        include: { items: true },
      });
      const event = { orderId: order.id, userId, totalAmount: Number(totalAmount.toString()), currency, items: order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })), };
      await this.recordAndPublish(order.id, 'order.created', event);
      if (key) await this.redis.setFor(key, order.id, IDEMPOTENCY_TTL_SECONDS);
      return this.toResponse(order);
    } catch (error) {
      if (key) await this.redis.del(key);
      throw error;
    }
  }

  async getOrder(orderId: string, requesterId: string, role: 'customer' | 'admin') {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || (role !== 'admin' && order.userId !== requesterId)) throw new NotFoundException('Order not found.');
    return this.toResponse(order);
  }

  async listOrders(requesterId: string, role: 'customer' | 'admin', query: ListOrdersQuery) {
    const where = role === 'admin' ? {} : { userId: requesterId };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.order.count({ where }),
    ]);
    return { orders: orders.map((order) => this.toResponse(order)), total, page: query.page, pageSize: query.pageSize };
  }

  /** Returns false for duplicate or terminal saga events, making RabbitMQ redelivery safe. */
  async consumeSagaEvent(eventType: 'stock.reserved' | 'stock.reservation_failed' | 'payment.succeeded' | 'payment.failed', payload: Record<string, unknown>) {
    const orderId = typeof payload.orderId === 'string' ? payload.orderId : undefined;
    if (!orderId) throw new Error(`${eventType} is missing orderId.`);
    const targetStatus: Record<typeof eventType, OrderStatus> = {
      'stock.reserved': 'awaiting_payment', 'stock.reservation_failed': 'cancelled', 'payment.succeeded': 'confirmed', 'payment.failed': 'cancelled',
    };
    const event = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException(`Order ${orderId} was not found.`);
      try {
        await tx.sagaEvent.create({ data: { orderId, eventType, direction: 'consumed', payload: payload as Prisma.InputJsonValue } });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') return null;
        throw error;
      }
      // A late event cannot reverse a terminal outcome. It is still retained in the audit log above.
      if (order.status === 'confirmed' || order.status === 'cancelled') return null;
      const updated = await tx.order.update({ where: { id: orderId }, data: { status: targetStatus[eventType] } });
      return updated;
    });
    if (!event) return false;

    if (eventType === 'stock.reservation_failed') await this.recordAndPublish(orderId, 'order.cancelled', { orderId, userId: event.userId, reason: payload.reason ?? payload.item ?? 'stock_reservation_failed' });
    if (eventType === 'payment.failed') await this.recordAndPublish(orderId, 'order.payment_failed', { orderId, userId: event.userId, reason: payload.reason ?? 'payment_failed' });
    if (eventType === 'payment.succeeded') await this.recordAndPublish(orderId, 'order.confirmed', { orderId, userId: event.userId });
    return true;
  }

  private async recordAndPublish(orderId: string, eventType: string, payload: Record<string, unknown>) {
    await this.prisma.sagaEvent.create({ data: { orderId, eventType, direction: 'published', payload: payload as Prisma.InputJsonValue } });
    this.rabbitmq.publish(eventType, payload);
  }

  private toResponse(order: { id: string; userId: string; status: OrderStatus; totalAmount: { toString(): string }; currency: string; createdAt: Date; updatedAt: Date; items: Array<{ productId: string; productNameSnapshot: string; unitPriceSnapshot: { toString(): string }; quantity: number; subtotal: { toString(): string } }> }) {
    return { id: order.id, userId: order.userId, status: order.status, totalAmount: Number(order.totalAmount.toString()), currency: order.currency, createdAt: order.createdAt, updatedAt: order.updatedAt, items: order.items.map((item) => ({ productId: item.productId, productNameSnapshot: item.productNameSnapshot, unitPriceSnapshot: Number(item.unitPriceSnapshot.toString()), quantity: item.quantity, subtotal: Number(item.subtotal.toString()) })) };
  }
}
