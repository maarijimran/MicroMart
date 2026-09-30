import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'node:path';

export interface OrderItemInput { productId: string; quantity: number }
export interface OrderResponse {
  found: boolean; id: string; userId: string; status: string; totalAmount: number; currency: string;
  items: { productId: string; productNameSnapshot: string; unitPriceSnapshot: number; quantity: number; subtotal: number }[];
  createdAt: string; updatedAt: string;
}
export interface ListOrdersResponse { orders: OrderResponse[]; total: number; page: number; pageSize: number }

type OrderGrpcClient = grpc.Client & {
  CreateOrder(request: { userId: string; idempotencyKey: string; items: OrderItemInput[] }, cb: (error: grpc.ServiceError | null, response: OrderResponse) => void): void;
  GetOrder(request: { orderId: string; userId: string; role: string }, cb: (error: grpc.ServiceError | null, response: OrderResponse) => void): void;
  ListOrders(request: { userId: string; role: string; page: number; pageSize: number }, cb: (error: grpc.ServiceError | null, response: ListOrdersResponse) => void): void;
};

@Injectable()
export class OrderClient implements OnModuleInit, OnModuleDestroy {
  private client!: OrderGrpcClient;

  onModuleInit() {
    const definition = protoLoader.loadSync(join(process.cwd(), '..', 'proto', 'order.proto'), {
      keepCase: false, longs: Number, enums: String, defaults: true, oneofs: true,
    });
    const descriptor = grpc.loadPackageDefinition(definition) as unknown as { micromart: { order: { OrderService: typeof grpc.Client } } };
    this.client = new descriptor.micromart.order.OrderService(
      process.env.ORDER_GRPC_URL ?? 'localhost:50053', grpc.credentials.createInsecure(),
    ) as OrderGrpcClient;
  }

  onModuleDestroy() { this.client?.close(); }

  createOrder(userId: string, idempotencyKey: string, items: OrderItemInput[]): Promise<OrderResponse> {
    return new Promise((resolve, reject) => this.client.CreateOrder({ userId, idempotencyKey, items }, (error, response) => {
      if (error) return reject(error);
      resolve(response);
    }));
  }

  getOrder(orderId: string, userId: string, role: string): Promise<OrderResponse> {
    return new Promise((resolve, reject) => this.client.GetOrder({ orderId, userId, role }, (error, response) => {
      if (error) return reject(error);
      resolve(response);
    }));
  }

  listOrders(userId: string, role: string, page: number, pageSize: number): Promise<ListOrdersResponse> {
    return new Promise((resolve, reject) => this.client.ListOrders({ userId, role, page, pageSize }, (error, response) => {
      if (error) return reject(error);
      resolve(response);
    }));
  }
}
