import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedUser, RequireAdminGuard, RequireUserGuard } from './jwt.guard';
import { listPaymentsQuerySchema, seedWalletSchema } from './payment.schemas';
import { PaymentService } from './payment.service';

@Controller()
@UseGuards(RequireUserGuard)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post('wallets/:userId/seed')
  @UseGuards(RequireAdminGuard)
  seedWallet(@Param('userId') userId: string, @Body() body: unknown) {
    return this.payments.seedWallet(userId, parse(seedWalletSchema, body));
  }

  @Get('wallets/me')
  getMyWallet(@Req() request: { user: AuthenticatedUser }) {
    return this.payments.getWallet(request.user.id, request.user.id, request.user.role);
  }

  @Get('wallets/:userId')
  getWallet(@Req() request: { user: AuthenticatedUser }, @Param('userId') userId: string) {
    return this.payments.getWallet(userId, request.user.id, request.user.role);
  }

  @Get('payments')
  listPayments(@Req() request: { user: AuthenticatedUser }, @Query() query: unknown) {
    return this.payments.listPayments(request.user.id, request.user.role, parse(listPaymentsQuerySchema, query));
  }

  @Get('payments/:orderId')
  getPayment(@Req() request: { user: AuthenticatedUser }, @Param('orderId') orderId: string) {
    return this.payments.getPayment(orderId, request.user.id, request.user.role);
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException({ message: 'Validation failed.', errors: result.error.flatten() });
  return result.data;
}
