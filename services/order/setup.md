# Order Service setup

Order owns `order_db` and drives the choreographed checkout saga. It exposes REST endpoints for local smoke testing plus gRPC methods for the Gateway. It calls Catalog only through its gRPC contract to snapshot product name, price, and currency at checkout; it never reads Catalog's database.

## Prerequisites

- Node.js 24+ and npm
- PostgreSQL, with an empty `order_db` database created
- Docker Desktop for the shared Redis and RabbitMQ services
- Catalog running on gRPC port 50052; Auth running if you use the REST routes

## Start shared infrastructure

From the repository root:

```powershell
docker compose -f infra/docker-compose.yml up -d redis rabbitmq
```

## Configure and migrate

```powershell
cd services/order
Copy-Item .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
```

Set `DATABASE_URL` to `order_db` and set `JWT_SECRET` to exactly the same secret as Auth. `CATALOG_GRPC_URL` defaults to `localhost:50052`.

## Run and verify

```powershell
npm run start:dev
npm run lint
npm test
npm run build
```

REST listens on `http://localhost:3003`; gRPC listens on `localhost:50053`.

## REST API

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/orders` | customer/admin | Checkout. Requires `Idempotency-Key`. |
| GET | `/orders` | customer/admin | Customer sees own orders; admin sees all. |
| GET | `/orders/:id` | customer/admin | Customer may access only their own order. |

REST requests use `Authorization: Bearer <accessToken>` issued by Auth. The checkout body is:

```json
{ "items": [{ "productId": "UUID", "quantity": 2 }] }
```

`Idempotency-Key` is scoped to the authenticated user and retained in Redis for 24 hours by default. Repeating the same request with the same key returns the original order.

## Saga behavior

- Creating an order writes a `pending` order and its frozen item snapshots, writes `order.created` to the append-only audit log, then publishes it.
- `stock.reserved` changes it to `awaiting_payment`.
- `stock.reservation_failed` cancels it and publishes `order.cancelled`.
- `payment.succeeded` confirms it and publishes `order.confirmed`.
- `payment.failed` cancels it and publishes `order.payment_failed`, allowing Catalog to release stock.

Consumed events are unique on `(order_id, event_type, direction)` and every duplicate delivery is acknowledged without changing state. Late saga events are retained in the audit log but cannot reverse a confirmed or cancelled order.

## Postman

Import `postman/MicroMart Order.postman_collection.json`. Run the Auth login request first, create a Catalog product with stock, set `productId`, then run Checkout. The collection stores the resulting `orderId` automatically.

## gRPC contract

The Gateway uses [`../../proto/order.proto`](../../proto/order.proto). Its `CreateOrder`, `GetOrder`, and `ListOrders` RPCs pass the authenticated user's identity from the Gateway rather than trusting client-provided REST fields.
