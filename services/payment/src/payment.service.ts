import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { RabbitMqService } from './rabbitmq.service';
import { ListPaymentsQuery, SeedWalletInput, StockReservedEvent } from './payment.schemas';

const RANDOM_SUCCESS_RATE = Number(process.env.RANDOM_SUCCESS_RATE ?? 1);

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMqService,
  ) {}

  // ---------------------------------------------------------------------
  // Wallets (fake payment method — admin-seeded balance, no real gateway)
  // ---------------------------------------------------------------------

  async seedWallet(userId: string, input: SeedWalletInput) {
    return this.prisma.wallet.upsert({
      where: { userId },
      create: { userId, balance: input.balance, currency: input.currency },
      update: { balance: input.balance, currency: input.currency },
    });
  }

  async getWallet(userId: string, requesterId: string, role: 'customer' | 'admin') {
    if (role !== 'admin' && userId !== requesterId) {
      throw new ForbiddenException('You can only view your own wallet.');
    }
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('No wallet exists for this user yet — ask an admin to seed one.');
    return this.toWalletResponse(wallet);
  }

  // ---------------------------------------------------------------------
  // Payments (read access)
  // ---------------------------------------------------------------------

  async listPayments(requesterId: string, role: 'customer' | 'admin', query: ListPaymentsQuery) {
    const where = role === 'admin' ? {} : { userId: requesterId };
    const [payments, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { payments: payments.map((p) => this.toPaymentResponse(p)), total, page: query.page, pageSize: query.pageSize };
  }

  async getPayment(orderId: string, requesterId: string, role: 'customer' | 'admin') {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment || (role !== 'admin' && payment.userId !== requesterId)) {
      throw new NotFoundException('Payment not found.');
    }
    return this.toPaymentResponse(payment);
  }

  // ---------------------------------------------------------------------
  // Saga: charge the wallet (consumes stock.reserved, publishes
  // payment.succeeded or payment.failed). Payment either succeeds or fails
  // outright here — there's nothing on Payment's own side to compensate.
  // ---------------------------------------------------------------------

  async processReservation(event: StockReservedEvent) {
    const already = await this.prisma.payment.findUnique({ where: { orderId: event.orderId } });
    if (already) {
      this.logger.log(`Order ${event.orderId} already has a payment record — skipping (idempotent).`);
      return;
    }

    const shouldSucceed = Math.random() < RANDOM_SUCCESS_RATE;

    // A single conditional UPDATE is atomic: it only matches (and only
    // debits) if the wallet has enough balance right now, so concurrent
    // charge attempts against the same wallet can never overdraw it.
    const debited = shouldSucceed
      ? await this.prisma.wallet.updateMany({
          where: { userId: event.userId, balance: { gte: event.totalAmount } },
          data: { balance: { decrement: event.totalAmount } },
        })
      : { count: 0 };

    let payment;
    if (debited.count > 0) {
      payment = await this.createPaymentRecord(event, 'succeeded', null);
      this.rabbitmq.publish('payment.succeeded', {
        orderId: event.orderId,
        paymentId: payment.id,
        amount: event.totalAmount,
        currency: event.currency,
      });
    } else {
      const reason = shouldSucceed ? 'insufficient_funds' : 'simulated_decline';
      payment = await this.createPaymentRecord(event, 'failed', reason);
      this.rabbitmq.publish('payment.failed', { orderId: event.orderId, reason });
    }
    return payment;
  }

  private async createPaymentRecord(event: StockReservedEvent, status: PaymentStatus, failureReason: string | null) {
    try {
      return await this.prisma.payment.create({
        data: {
          orderId: event.orderId,
          userId: event.userId,
          amount: event.totalAmount,
          currency: event.currency,
          status,
          failureReason,
        },
      });
    } catch (error) {
      // Redelivery raced us here and another instance already recorded this
      // order's payment (unique constraint on order_id) — safe to no-op.
      if ((error as { code?: string }).code === 'P2002') {
        return this.prisma.payment.findUniqueOrThrow({ where: { orderId: event.orderId } });
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private toWalletResponse(wallet: { userId: string; balance: { toString(): string }; currency: string; updatedAt: Date }) {
    return { userId: wallet.userId, balance: Number(wallet.balance.toString()), currency: wallet.currency, updatedAt: wallet.updatedAt };
  }

  private toPaymentResponse(payment: {
    id: string; orderId: string; userId: string; amount: { toString(): string }; currency: string;
    status: PaymentStatus; failureReason: string | null; createdAt: Date;
  }) {
    return {
      id: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      amount: Number(payment.amount.toString()),
      currency: payment.currency,
      status: payment.status,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
    };
  }
}
