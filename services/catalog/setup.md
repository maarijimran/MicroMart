# Catalog Service setup

This service exposes REST endpoints (public browsing + admin management), an internal gRPC surface for the API Gateway and Order Service, and a RabbitMQ consumer that plays Catalog's side of the choreographed checkout saga. It uses its own local PostgreSQL database (`catalog_db`), Redis, Elasticsearch, and RabbitMQ.

## Prerequisites

- Node.js 24+ and npm
- A local PostgreSQL instance
- The shared infra stack running (Redis, RabbitMQ, Elasticsearch) — see below
- The Auth service should exist and share the same `JWT_SECRET`, since Catalog verifies access tokens locally rather than calling Auth for every request

## Start shared infra

From the repository root:

```powershell
docker compose -f infra/docker-compose.yml up -d redis rabbitmq elasticsearch
```

Confirm Elasticsearch is actually up before continuing — `curl http://localhost:9200` should return a JSON banner. It's the slowest of the three to start.

## Create the database

In pgAdmin (or `psql`), create a database named `catalog_db` — Prisma will create the tables, but not the database itself.

## Configure and install

```powershell
cd services/catalog
Copy-Item .env.example .env
npm install
npm run prisma:generate
```

Edit `.env`:
- `DATABASE_URL` — point at your local `catalog_db`.
- `JWT_SECRET` — **must be the exact same value configured on the Auth service.** Catalog verifies JWTs locally using this shared secret instead of calling Auth's `VerifyToken` gRPC method on every request; if the secrets don't match, every admin-only request will return 401 even with a token that Auth issued correctly.
- `RABBITMQ_URL` / `ELASTICSEARCH_URL` — defaults match the shared `infra/docker-compose.yml` and shouldn't need changes for local use.

## Run the first migration

```powershell
npm run prisma:migrate -- --name init
```

This creates `categories`, `products`, `inventory`, and `inventory_reservations` in `catalog_db`.

## Run and verify

```powershell
npm run start:dev
```

REST listens on `http://localhost:3002`; gRPC listens on `localhost:50052`. On startup you should see log lines confirming it connected to RabbitMQ and bound the `catalog.saga` queue — if RabbitMQ isn't up yet, it retries with backoff rather than crashing, so starting services in any order is fine.

```powershell
npm run lint
npm test
npm run build
```

## REST API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/categories` | admin | Create a category |
| GET | `/categories` | public | List categories |
| POST | `/products` | admin | Create a product (and its initial inventory row) |
| PATCH | `/products/:id` | admin | Update name, description, price, or active status |
| POST | `/products/:id/stock` | admin | Set `quantityAvailable` directly |
| GET | `/products` | public | Search/browse (`q`, `categoryId`, `minPrice`, `maxPrice`, `page`, `pageSize`), served from Elasticsearch |
| GET | `/products/:id` | public | Fetch one product (Redis cache-aside, 60s TTL by default) |

Admin routes expect `Authorization: Bearer <accessToken>` from an account whose JWT `role` claim is `admin`. Registering through the Auth service always creates a `customer` — to test the admin routes locally, promote a user directly in `auth_db`:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

## The saga: what this service does automatically

You don't call these directly — they happen in response to events once Order Service exists and publishes them. Documented here so it's clear what's happening when you see it in the logs:

- **Consumes `order.created`** → attempts to reserve stock for every line item via a single atomic conditional `UPDATE ... WHERE quantity_available >= qty`, which prevents overselling under concurrent requests without needing an explicit lock. Publishes `stock.reserved` if every item succeeds, or `stock.reservation_failed` (after rolling back any reservations already made for that order) if any item doesn't have enough stock.
- **Consumes `order.cancelled` / `order.payment_failed`** → releases any pending reservations for that order (the compensating action).
- Every consumed event is checked against a Redis idempotency key (`processed:{orderId}:{eventType}`) before doing anything, and the reservation logic is separately idempotent at the database level too (`reserveStockForOrder` no-ops if reservations for that order already exist) — a redelivered RabbitMQ message can't double-reserve or double-release.

## Elasticsearch sync

Product create/update calls write to Postgres and then index the product into Elasticsearch's `products` index synchronously, in the same request. If Elasticsearch is briefly unreachable, the Postgres write still succeeds and a warning is logged rather than failing the request — search results will just be stale until the next write or a manual reindex. There's no backfill/reindex script included; for a small catalog, re-saving each product (a no-op `PATCH` with no changed fields still triggers a re-index) is enough while learning.

## Postman

Import `postman/MicroMart Catalog.postman_collection.json`. Run "Login (Auth service)" first (it expects Auth running on `localhost:3001` and an admin account — see the SQL above) to populate the `adminAccessToken` variable, then the rest of the requests can run in order.

## gRPC contract

The API Gateway and Order Service should use [`../../proto/catalog.proto`](../../proto/catalog.proto), included alongside this service. It exposes `CheckAvailability` (does this product have at least N units available right now) and `GetProduct` (used by Order Service to snapshot name/price at checkout time — see the project brief, section 4.4, FR2).
