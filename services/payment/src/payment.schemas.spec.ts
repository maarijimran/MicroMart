import { seedWalletSchema, stockReservedEventSchema } from './payment.schemas';

describe('Payment request schemas', () => {
  it('accepts a valid seed amount and defaults currency', () => {
    const result = seedWalletSchema.safeParse({ balance: 100 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.currency).toBe('USD');
  });

  it('rejects a negative balance', () => {
    expect(seedWalletSchema.safeParse({ balance: -1 }).success).toBe(false);
  });

  it('accepts a well-formed stock.reserved event', () => {
    const result = stockReservedEventSchema.safeParse({
      orderId: '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f',
      userId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      totalAmount: 39.98,
      currency: 'USD',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a stock.reserved event with a non-positive amount', () => {
    const result = stockReservedEventSchema.safeParse({
      orderId: '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f',
      userId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      totalAmount: 0,
      currency: 'USD',
    });
    expect(result.success).toBe(false);
  });
});
