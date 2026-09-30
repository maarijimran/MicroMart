import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { OrderService } from './order.service';

@Controller()
export class OrderGrpcController {
  constructor(private readonly orders: OrderService) {}

  @GrpcMethod('OrderService', 'CreateOrder')
  create(request: { userId?: string; user_id?: string; idempotencyKey?: string; idempotency_key?: string; items?: Array<{ productId?: string; product_id?: string; quantity: number }> }) {
    const userId = request.userId ?? request.user_id;
    if (!userId) throw new Error('user_id is required.');
    return this.orders.createOrder(userId, { items: (request.items ?? []).map((item) => ({ productId: item.productId ?? item.product_id ?? '', quantity: item.quantity })) }, request.idempotencyKey ?? request.idempotency_key);
  }

  @GrpcMethod('OrderService', 'GetOrder')
  async get(request: { orderId?: string; order_id?: string; userId?: string; user_id?: string; role?: 'customer' | 'admin' }) {
    try {
      const order = await this.orders.getOrder(request.orderId ?? request.order_id ?? '', request.userId ?? request.user_id ?? '', request.role ?? 'customer');
      return { found: true, ...order };
    } catch { return { found: false }; }
  }

  @GrpcMethod('OrderService', 'ListOrders')
  async list(request: { userId?: string; user_id?: string; role?: 'customer' | 'admin'; page?: number; pageSize?: number; page_size?: number }) {
    const page = request.page && request.page > 0 ? request.page : 1;
    const pageSize = request.pageSize ?? request.page_size;
    const result = await this.orders.listOrders(request.userId ?? request.user_id ?? '', request.role ?? 'customer', { page, pageSize: pageSize && pageSize > 0 ? Math.min(pageSize, 100) : 20 });
    return result;
  }
}
