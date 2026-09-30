import { z } from 'zod';

const uuid = z.string().uuid();

const slug = z
  .string({ error: 'Enter a slug.' })
  .trim()
  .toLowerCase()
  .min(1, 'Enter a slug.')
  .max(200, 'Slug must be 200 characters or fewer.')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug can only contain lowercase letters, numbers and single hyphens.');

/**
 * Multipart fields arrive as strings. Blank means "missing" and anything else
 * is converted here (not with z.coerce, which turns blanks into NaN), so the
 * two cases get different messages.
 */
const numberField = (missing: string, invalid: string) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return undefined;
      return typeof value === 'string' ? Number(value.trim()) : value;
    },
    z.number({ error: (issue) => (issue.input === undefined ? missing : invalid) }),
  );

const hasAtMostTwoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

export const createCategorySchema = z.object({
  name: z
    .string({ error: 'Enter a category name.' })
    .trim()
    .min(1, 'Enter a category name.')
    .max(150, 'Category name must be 150 characters or fewer.'),
  slug,
  parentId: uuid.optional(),
});

export const createProductSchema = z.object({
  categoryId: z.string({ error: 'Choose a category.' }).uuid('Choose a category.'),
  sku: z
    .string({ error: 'Enter a SKU.' })
    .trim()
    .min(1, 'Enter a SKU.')
    .max(64, 'SKU must be 64 characters or fewer.')
    .regex(/^[A-Za-z0-9._-]+$/, 'SKU can only contain letters, numbers, dots, hyphens and underscores.'),
  name: z
    .string({ error: 'Enter a product name.' })
    .trim()
    .min(1, 'Enter a product name.')
    .max(200, 'Product name must be 200 characters or fewer.'),
  slug,
  description: z
    .string()
    .trim()
    .max(5000, 'Description must be 5,000 characters or fewer.')
    .optional()
    .transform((value) => value || undefined),
  price: numberField('Enter a price.', 'Price must be a number.').pipe(
    z
      .number()
      .positive('Price must be greater than 0.')
      .max(1_000_000, 'Price can’t be more than 1,000,000.')
      .refine(hasAtMostTwoDecimals, 'Price can have at most 2 decimal places.'),
  ),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code like USD.')
    .default('USD'),
  initialQuantity: numberField('Enter a stock quantity.', 'Stock must be a number.')
    .pipe(
      z
        .number()
        .int('Stock must be a whole number.')
        .nonnegative('Stock can’t be negative.')
        .max(1_000_000, 'Stock can’t be more than 1,000,000.'),
    )
    .default(0),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1, 'Enter a product name.').max(200, 'Product name must be 200 characters or fewer.').optional(),
  description: z.string().trim().max(5000, 'Description must be 5,000 characters or fewer.').optional(),
  price: z
    .number({ error: 'Price must be a number.' })
    .positive('Price must be greater than 0.')
    .max(1_000_000, 'Price can’t be more than 1,000,000.')
    .optional(),
  isActive: z.boolean({ error: 'isActive must be true or false.' }).optional(),
});

export const setStockSchema = z.object({
  quantityAvailable: z
    .number({ error: 'Enter a quantity.' })
    .int('Quantity must be a whole number.')
    .nonnegative('Quantity can’t be negative.')
    .max(1_000_000, 'Quantity can’t be more than 1,000,000.'),
});

export const PRODUCT_SORTS = ['relevance', 'price_asc', 'price_desc'] as const;

export const listProductsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200, 'Search must be 200 characters or fewer.').optional(),
    categoryId: uuid.optional(),
    minPrice: z.coerce.number({ error: 'Minimum price must be a number.' }).nonnegative('Minimum price can’t be negative.').optional(),
    maxPrice: z.coerce.number({ error: 'Maximum price must be a number.' }).nonnegative('Maximum price can’t be negative.').optional(),
    sort: z.enum(PRODUCT_SORTS, { error: 'Unknown sort option.' }).default('relevance'),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine((query) => query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice, {
    message: 'Minimum price can’t be greater than maximum price.',
    path: ['minPrice'],
  });

export const reserveItemsSchema = z.object({
  orderId: uuid,
  userId: uuid,
  totalAmount: z.number().positive(),
  currency: z.string().length(3),
  items: z.array(z.object({ productId: uuid, quantity: z.number().int().positive() })).min(1),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type SetStockInput = z.infer<typeof setStockSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ReserveItemsInput = z.infer<typeof reserveItemsSchema>;
