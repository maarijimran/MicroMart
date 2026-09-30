import { z } from 'zod';

const uuid = z.string().uuid();

export const checkoutSchema = z.object({
  items: z.array(z.object({ productId: uuid, quantity: z.number().int().positive() })).min(1),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
