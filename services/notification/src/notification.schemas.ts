import { z } from 'zod';

const uuid = z.string().uuid();

/**
 * Order Service's order.confirmed / order.cancelled events. Only orderId is
 * required here — extra fields (reason, userId, etc.) are allowed through
 * via .passthrough() and used opportunistically if present, since this
 * service's only real job is to log that *something* happened for an order.
 */
export const orderOutcomeEventSchema = z
  .object({
    orderId: uuid,
    reason: z.string().optional(),
  })
  .passthrough();

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type OrderOutcomeEvent = z.infer<typeof orderOutcomeEventSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
