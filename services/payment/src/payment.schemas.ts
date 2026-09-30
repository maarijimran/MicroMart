import { z } from 'zod';

const uuid = z.string().uuid();

export const seedWalletSchema = z.object({
  balance: z.number().nonnegative().max(1_000_000),
  currency: z.string().length(3).toUpperCase().default('USD'),
});

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/** Shape of the stock.reserved event this service reacts to. */
export const stockReservedEventSchema = z.object({
  orderId: uuid,
  userId: uuid,
  totalAmount: z.number().positive(),
  currency: z.string().length(3),
});

export type SeedWalletInput = z.infer<typeof seedWalletSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type StockReservedEvent = z.infer<typeof stockReservedEventSchema>;
