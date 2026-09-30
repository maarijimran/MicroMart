import { createProductSchema, listProductsQuerySchema, setStockSchema } from './catalog.schemas';

describe('Catalog request schemas', () => {
  it('accepts a valid product and defaults currency/initialQuantity', () => {
    const result = createProductSchema.safeParse({
      categoryId: '11111111-1111-4111-8111-111111111111',
      sku: 'SKU-1',
      name: 'Widget',
      slug: 'widget',
      price: 9.99,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('USD');
      expect(result.data.initialQuantity).toBe(0);
    }
  });

  it('rejects a slug with spaces or uppercase letters', () => {
    const result = createProductSchema.safeParse({
      categoryId: '11111111-1111-4111-8111-111111111111',
      sku: 'SKU-1',
      name: 'Widget',
      slug: 'Not A Slug',
      price: 9.99,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative stock quantity', () => {
    expect(setStockSchema.safeParse({ quantityAvailable: -1 }).success).toBe(false);
  });

  it('coerces multipart string fields and reports clear messages', () => {
    const ok = createProductSchema.safeParse({
      categoryId: '11111111-1111-4111-8111-111111111111',
      sku: 'SKU-1',
      name: 'Widget',
      slug: 'widget',
      price: '19.50',
      initialQuantity: '3',
    });
    expect(ok.success && ok.data.price === 19.5 && ok.data.initialQuantity === 3).toBe(true);

    const bad = createProductSchema.safeParse({ categoryId: '', sku: 'has space', name: '', slug: 'widget', price: '1.999', initialQuantity: '-1' });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const messages = bad.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      expect(messages).toEqual(
        expect.arrayContaining([
          'categoryId: Choose a category.',
          'sku: SKU can only contain letters, numbers, dots, hyphens and underscores.',
          'name: Enter a product name.',
          'price: Price can have at most 2 decimal places.',
          'initialQuantity: Stock can’t be negative.',
        ]),
      );
    }
  });

  it('says "Enter a price." when price is blank rather than a type error', () => {
    const result = createProductSchema.safeParse({ categoryId: '11111111-1111-4111-8111-111111111111', sku: 'A', name: 'B', slug: 'b', price: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.find((i) => i.path[0] === 'price')?.message).toBe('Enter a price.');
  });

  it('rejects a min price above the max price', () => {
    const result = listProductsQuerySchema.safeParse({ minPrice: '50', maxPrice: '10' });
    expect(result.success).toBe(false);
  });

  it('coerces query string pagination params to numbers with sane defaults', () => {
    const result = listProductsQuerySchema.safeParse({ q: 'widget' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });
});
