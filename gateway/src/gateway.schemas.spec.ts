import { checkoutSchema, paginationQuerySchema } from './gateway.schemas';

describe('Gateway request schemas', () => {
  it('accepts a well-formed checkout payload', () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f', quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty cart', () => {
    expect(checkoutSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('rejects a non-positive quantity', () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f', quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('defaults pagination', () => {
    const result = paginationQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });
});
