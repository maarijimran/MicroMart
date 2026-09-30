# Payment Service setup

Payment is a **fake payment method** — a simulated per-user wallet balance, not a real payment gateway. It owns `payment_db`, exposes REST endpoints for local testing plus a small gRPC surface, and consumes `stock.reserved` to charge the wallet as its half of the choreographed checkout saga.

## ⚠️ Required: one small update to the Catalog service first

Payment needs `userId`, `totalAmount`, and `currency` to know who and how much to charge — but Catalog's `stock.reserved` event, as originally built, only carries `orderId` and `items`. Order already publishes all four fields on `order.created`; Catalog just wasn't forwarding the extra three through. Apply this small patch to your existing Catalog service before starting Payment:

**`services/catalog/src/catalog.schemas.ts`** — extend `reserveItemsSchema`:
```ts
export const reserveItemsSchema = z.object({
  orderId: uuid,
  userId: uuid,
  totalAmount: z.number().positive(),
  currency: z.string().length(3),
  items: z.array(z.object({ productId: uuid, quantity: z.number().int().positive() })).min(1),
});
```

**`services/catalog/src/catalog.service.ts`** — thread the extra fields through `reserveStockForOrder` and into both events it publishes:
```ts
async reserveStockForOrder(
  orderId: string,
  userId: string,
  totalAmount: number,
  currency: string,
  items: OrderItem[],
) {
  // ...unchanged reservation logic...

  if (failure) {
    // ...unchanged rollback loop...
    this.rabbitmq.publish('stock.reservation_failed', { orderId, userId, item: failure });
    return;
  }

  this.rabbitmq.publish('stock.reserved', { orderId, userId, totalAmount, currency, items });
}
```

**`services/catalog/src/catalog.consumer.ts`** — pass the new fields through the call:
```ts
await this.catalog.reserveStockForOrder(
  parsed.data.orderId,
  parsed.data.userId,
  parsed.data.totalAmount,
  parsed.data.currency,
  parsed.data.items,
);
```

This is the only change needed anywhere else in the system for Payment to work end to end.

## Prerequisites

- Node.js 24+ and npm
- PostgreSQL, with an empty `payment_db` database created
- Docker Desktop for the shared Redis and RabbitMQ services
- Order and Catalog running (Payment reacts to their events; it doesn't call either directly)

## Start shared infrastructure

From the repository root:

```powershell
docker compose -f infra/docker-compose.yml up -d redis rabbitmq
```

## Configure and migrate

```powershell
cd services/payment
Copy-Item .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
```

Set `DATABASE_URL` to `payment_db` and `JWT_SECRET` to exactly the same secret as Auth (Payment verifies REST tokens locally, same pattern as Catalog and Order). `RANDOM_SUCCESS_RATE` defaults to `1` (always attempt a real balance check); set it below 1 — e.g. `0.7` — to make Payment randomly decline some charges even with a fully-funded wallet, so you can watch the `payment.failed → order.payment_failed → Catalog releases stock` compensation path without having to manually drain a wallet.

## Run and verify

```powershell
npm run start:dev
npm run lint
npm test
npm run build
```

REST listens on `http://localhost:3004`; gRPC listens on `localhost:50054`.

## Wallets: there's no real money and no self-service top-up

A user's wallet only exists once an admin seeds it — `POST /wallets/:userId/seed`. If a user checks out with no wallet at all, `processReservation` treats that exactly like insufficient funds: the charge fails and the saga compensates normally (stock gets released). That's intentional — it's the simplest way to be able to demonstrate both the success and failure paths locally without extra scaffolding.

## REST API

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/wallets/:userId/seed` | admin | Set (or create) a user's wallet balance |
| GET | `/wallets/me` | any authenticated user | Get your own wallet |
| GET | `/wallets/:userId` | admin | Get any user's wallet |
| GET | `/payments` | any authenticated user | List payments — customers see only their own, admins see all |
| GET | `/payments/:orderId` | owner or admin | Get one payment by order id |

All routes require `Authorization: Bearer <accessToken>` issued by Auth.

## Saga behavior

- **Consumes `stock.reserved`** → attempts to debit the wallet via a single atomic conditional `UPDATE ... WHERE balance >= amount`, the same overselling-proof pattern Catalog uses for stock. Publishes `payment.succeeded` (with a `paymentId`) or `payment.failed` (with a `reason` of `insufficient_funds` or, if `RANDOM_SUCCESS_RATE` is set below 1, `simulated_decline`).
- Every attempt — success or failure — is recorded in `payments`, keyed uniquely by `order_id`. That uniqueness constraint is what makes a redelivered `stock.reserved` message safe: a retry after the record already exists is a no-op, not a double charge. There's also a Redis idempotency pre-check ahead of it, same pattern as Catalog and Order.
- Payment has no compensating action of its own — unlike Catalog, it either succeeds or fails outright here, so there's nothing to release on Payment's side if a later step in the saga were to fail (there is no later step after Payment in this saga).

## Postman

Import `postman/MicroMart Payment.postman_collection.json`. Log in as both a customer and an admin first, seed the customer's wallet, then the wallet/payment reads will work. To see a real charge happen, place an order through the Order service after seeding that customer's wallet — watch this service's logs for `stock.reserved` being consumed.

## gRPC contract

Uses [`../../proto/payment.proto`](../../proto/payment.proto), included alongside this service. Exposes `GetPayment` for a future Gateway to check payment status without querying `payment_db` directly.
