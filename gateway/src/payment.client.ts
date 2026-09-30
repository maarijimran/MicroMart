import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'node:path';

export interface PaymentResponse {
  found: boolean; id: string; orderId: string; userId: string; amount: number; currency: string; status: string; failureReason: string;
}

type PaymentGrpcClient = grpc.Client & {
  GetPayment(request: { orderId: string }, cb: (error: grpc.ServiceError | null, response: PaymentResponse) => void): void;
};

@Injectable()
export class PaymentClient implements OnModuleInit, OnModuleDestroy {
  private client!: PaymentGrpcClient;

  onModuleInit() {
    const definition = protoLoader.loadSync(join(process.cwd(), '..', 'proto', 'payment.proto'), {
      keepCase: false, longs: Number, enums: String, defaults: true, oneofs: true,
    });
    const descriptor = grpc.loadPackageDefinition(definition) as unknown as { micromart: { payment: { PaymentService: typeof grpc.Client } } };
    this.client = new descriptor.micromart.payment.PaymentService(
      process.env.PAYMENT_GRPC_URL ?? 'localhost:50054', grpc.credentials.createInsecure(),
    ) as PaymentGrpcClient;
  }

  onModuleDestroy() { this.client?.close(); }

  getPayment(orderId: string): Promise<PaymentResponse> {
    return new Promise((resolve, reject) => this.client.GetPayment({ orderId }, (error, response) => {
      if (error) return reject(error);
      resolve(response);
    }));
  }
}
