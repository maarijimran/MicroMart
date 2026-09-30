# Gateway setup

The single REST front door for MicroMart. No database of its own. Two different things happen behind it, and it's worth knowing which route does which before you read the code:

- **Proxy routes** (`/auth/*`, `/categories`, `/products*`, `/wallets/*`, `/payments` list) forward straight through to that service's own REST API, unchanged. Those services already have complete, correct REST implementations — reimplementing them here over gRPC would be pure duplication.
- **gRPC-translated routes** (`POST /orders`, `GET /orders`, `GET /orders/:id`, `GET /payments/order/:orderId`) are the two places that actually do what the project brief calls "REST in, gRPC to services." A single REST call here becomes a gRPC call to Order or Payment. **Checkout is the important one** — `POST /orders` is what actually kicks off the choreographed saga across Catalog and Payment.

## Prerequisites

- Node.js 24+ and npm
- Docker Desktop for the shared Redis service (rate limiting)
- Auth, Catalog, Order, and Payment all running — this service calls all four

## Start shared infrastructure

```powershell
docker compose -f infra/docker-compose.yml up -d redis
```

## Configure and install

```powershell
cd gateway
Copy-Item .env.example .env
npm install
```

No Prisma step — this service has no database, so there's nothing to migrate. Set `JWT_SECRET` to the same value as every other service, and check the downstream URLs in `.env` match the ports those services are actually running on.

## Run and verify

```powershell
npm run start:dev
npm run lint
npm test
npm run build
```

Listens on `http://localhost:3000`. No gRPC port of its own — this service only ever acts as a gRPC *client* (to Order and Payment), never a server.

## Rate limiting

Two tiers, both Redis-backed (not in-memory — see the project brief, Redis section 6.1, on why that matters once you scale this service to multiple replicas):

| Guard | Applies to | Default limit |
| --- | --- | --- |
| `GlobalRateLimitGuard` | Every route | 100 requests / 60s per IP |
| `AuthRateLimitGuard` | `/auth/register`, `/auth/login` only | 5 requests / 60s per IP |

Tune via `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS` and `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_SECONDS`.

## Auth: defense in depth, not defense in exactly one place

Admin-only proxy routes (`POST /categories`, `POST /products`, `POST /wallets/:userId/seed`, etc.) are checked by the gateway's own `RequireAdminGuard` **and** forwarded with the caller's `Authorization` header intact so the downstream service re-checks it too. That's intentional — a service should never assume "the gateway already verified this" is safe to rely on as its only line of defense. If you ever add a second entry point into the system (another gateway, an internal script hitting a service directly), the downstream check is what actually protects it.

## Checkout end to end

`POST /orders` requires a customer's Bearer token. It:
1. Validates the cart with Zod (`items: [{ productId, quantity }]`, at least one item).
2. Generates an `Idempotency-Key` if you didn't send one (send your own for a real retry-safe client).
3. Calls Order Service's `CreateOrder` gRPC method — Order takes it from there, snapshotting price/name via its own gRPC call to Catalog, publishing `order.created`, and the saga plays out asynchronously across Catalog and Payment.

The order comes back in `pending` status immediately — checkout does **not** block waiting for the saga to finish. Poll `GET /orders/:id` a couple of times a second or two apart and you should see it move `pending → awaiting_payment → confirmed` (or `→ cancelled`, if the wallet wasn't seeded or Payment's `RANDOM_SUCCESS_RATE` triggered a decline).

## Postman

Import `postman/MicroMart Gateway.postman_collection.json` and run it top to bottom — it's written as one continuous real flow: register, log in as both a customer and an admin, create a category and product, seed the customer's wallet, check out, then poll the order and look up its payment. This is the collection to reach for when you want to see the whole system work together, rather than testing one service in isolation.
