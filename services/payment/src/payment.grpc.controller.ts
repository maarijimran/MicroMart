import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PaymentService } from './payment.service';

@Controller()
export class PaymentGrpcController {
  constructor(private readonly payments: PaymentService) {}

  @GrpcMethod('PaymentService', 'GetPayment')
  async getPayment(request: { orderId: string }) {
    try {
      // gRPC callers are trusted internal services, so this bypasses the
      // ownership check that the REST guards enforce for end users.
      const payment = await this.payments.getPayment(request.orderId, request.orderId, 'admin');
      return { found: true, ...payment };
    } catch {
      return { found: false };
    }
  }
}
