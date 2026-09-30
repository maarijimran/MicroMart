import { listNotificationsQuerySchema, orderOutcomeEventSchema } from './notification.schemas';

describe('Notification schemas', () => {
  it('accepts an order.confirmed-style event with just an orderId', () => {
    const result = orderOutcomeEventSchema.safeParse({ orderId: '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f' });
    expect(result.success).toBe(true);
  });

  it('accepts an order.cancelled-style event with a reason', () => {
    const result = orderOutcomeEventSchema.safeParse({
      orderId: '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f',
      reason: 'insufficient_funds',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an event with no orderId', () => {
    expect(orderOutcomeEventSchema.safeParse({ reason: 'insufficient_funds' }).success).toBe(false);
  });

  it('defaults pagination for the listing query', () => {
    const result = listNotificationsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });
});
