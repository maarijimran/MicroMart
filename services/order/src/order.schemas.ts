import { z } from 'zod';

const uuid = z.string().uuid();
export const createOrderSchema = z.object({
  items: z.array(z.object({ productId: uuid, quantity: z.number().int().positive().max(10_000) })).min(1).max(100),
}).superRefine((value, context) => {
  const ids = new Set<string>();
  value.items.forEach((item, index) => {
    if (ids.has(item.productId)) context.addIssue({ code: 'custom', path: ['items', index, 'productId'], message: 'Each product may appear only once.' });
    ids.add(item.productId);
  });
});
export const listOrdersQuerySchema = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().max(100).default(20) });
export const sagaEventSchema = z.object({ orderId: uuid });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
