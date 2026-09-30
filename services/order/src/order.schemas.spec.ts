import { createOrderSchema, listOrdersQuerySchema } from './order.schemas';

describe('order schemas', () => {
  const productId = '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f';

  it('accepts a valid checkout payload', () => {
    expect(createOrderSchema.safeParse({ items: [{ productId, quantity: 2 }] }).success).toBe(true);
  });

  it('rejects duplicate products so reservation events remain unambiguous', () => {
    expect(createOrderSchema.safeParse({ items: [{ productId, quantity: 1 }, { productId, quantity: 2 }] }).success).toBe(false);
  });

  it('coerces and defaults pagination', () => {
    expect(listOrdersQuerySchema.parse({ page: '2' })).toEqual({ page: 2, pageSize: 20 });
  });
});
