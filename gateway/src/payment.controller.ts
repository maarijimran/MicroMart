import { Body, Controller, Get, Headers, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AuthenticatedUser, RequireAdminGuard, RequireUserGuard } from './jwt.guard';
import { GlobalRateLimitGuard } from './rate-limit.guard';
import { ProxyService } from './proxy.service';
import { PaymentClient } from './payment.client';

const PAYMENT_URL = () => process.env.PAYMENT_URL ?? 'http://localhost:3004';

@Controller()
@UseGuards(GlobalRateLimitGuard, RequireUserGuard)
export class PaymentController {
  constructor(
    private readonly proxy: ProxyService,
    private readonly paymentClient: PaymentClient,
  ) {}

  @Post('wallets/:userId/seed')
  @UseGuards(RequireAdminGuard)
  async seedWallet(@Param('userId') userId: string, @Body() body: unknown, @Headers('authorization') authorization: string, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('POST', `${PAYMENT_URL()}/wallets/${userId}/seed`, { body, authorization });
    reply.status(result.status).send(result.body);
  }

  @Get('wallets/me')
  async getMyWallet(@Headers('authorization') authorization: string, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('GET', `${PAYMENT_URL()}/wallets/me`, { authorization });
    reply.status(result.status).send(result.body);
  }

  @Get('payments')
  async listPayments(@Headers('authorization') authorization: string, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('GET', `${PAYMENT_URL()}/payments`, { authorization });
    reply.status(result.status).send(result.body);
  }

  /**
   * The one payment route that goes over gRPC instead of proxying — a
   * second, smaller example of REST -> gRPC translation alongside checkout.
   */
  @Get('payments/order/:orderId')
  async getPaymentByOrder(@Param('orderId') orderId: string, @Req() request: { user: AuthenticatedUser }) {
    const payment = await this.paymentClient.getPayment(orderId);
    if (payment.found && request.user.role !== 'admin' && payment.userId !== request.user.id) {
      // Don't leak another user's payment just because the order id was guessable.
      return { found: false };
    }
    return payment;
  }
}
