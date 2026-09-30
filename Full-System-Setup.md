# MicroMart — Full System Setup & End-to-End Test

This ties together the six per-service `setup.md` files into one boot sequence and one real test of the whole saga. Read this after each service is individually building and testing clean on its own.

---

## 0. Before anything else

**Apply the Catalog patch**, if you haven't already (from when Payment was built): `catalog.schemas.ts`, `catalog.service.ts`, and `catalog.consumer.ts` need to forward `userId`/`totalAmount`/`currency` through `stock.reserved`. Without this, Payment never gets charged and every order gets stuck in `awaiting_payment` forever. This is the single most common thing to forget.

---

## 1. One-time setup

### 1.1 Create the five databases

Each service owns its own database — nothing shares. In pgAdmin (or `psql`), create:

```
auth_db
catalog_db
order_db
payment_db
notification_db
```

Gateway has no database.

### 1.2 Pick one JWT secret and use it everywhere

Generate one random string and paste it into `JWT_SECRET` in **all six** `.env` files (Gateway included, even though it has no DB). A mismatch anywhere is the single most common cause of mysterious 401s — if something that should work returns 401, check this first.

### 1.3 Start shared infrastructure

From the repo root:

```powershell
cd infra
docker compose up -d
docker ps
```

You should see 8 containers: `redis`, `rabbitmq`, `elasticsearch`, `object-storage`, `prometheus`, `grafana`, `loki`, `tempo`. Wait for Elasticsearch specifically — it's the slowest and the one most likely to need a Docker Desktop memory bump (Settings → Resources → at least 4GB).

`object-storage` is SeaweedFS, an S3-compatible store for product photos (port 8333). Catalog creates the `micromart-products` bucket on first start. Its local-only credentials live in `infra/seaweedfs/s3.json` and must match Catalog's `S3_*` settings. In production, point Catalog's `S3_*` variables at AWS S3 (or R2 etc.) instead — see `services/catalog/.env.example`.

Quick checks:
```powershell
curl http://localhost:9200          # Elasticsearch banner
curl http://localhost:8333          # object storage responds
```
RabbitMQ management UI: `http://localhost:15672` (guest/guest). Grafana: `http://localhost:3000` — **note this collides with Gateway's default port 3000**; if you're running Grafana, either change Gateway's `PORT` in its `.env` or don't run both on 3000 at once.

### 1.4 Install, generate, migrate — for each of Auth, Catalog, Order, Payment, Notification

```powershell
cd services/<name>
Copy-Item .env.example .env    # then edit DATABASE_URL, JWT_SECRET, etc.
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
```

Gateway skips this whole step — no `.env.example` → copy, `npm install` only, no Prisma anything.

**Already set up before product photos were added?** Catalog has a new migration (`product_images`) and new `S3_*` settings. Copy the `S3_*` block from `services/catalog/.env.example` into your `.env`, then:

```powershell
cd services/catalog
npm install
npx prisma migrate deploy
npm run prisma:generate
```

---

## 2. Port map (so nothing collides)

| Service | REST | gRPC | Database |
|---|---|---|---|
| Gateway | 3000 | — (client only) | none |
| Auth | 3001 | 50051 | `auth_db` |
| Catalog | 3002 | 50052 | `catalog_db` |
| Order | 3003 | 50053 | `order_db` |
| Payment | 3004 | 50054 | `payment_db` |
| Notification | 3005 | — (no gRPC surface) | `notification_db` |
| Object storage (product photos) | 8333 (S3 API) | — | — |

---

## 3. Boot order

Mostly order-independent — every RabbitMQ consumer retries its connection with backoff rather than crashing if the broker (or another service) isn't up yet. Two real constraints:

- **RabbitMQ must be up before any service** (all five business services connect to it at startup).
- **Catalog must be reachable by the time an order is actually checked out** (Order calls Catalog's gRPC `GetProduct` synchronously during `createOrder`, not just via the async saga) — it doesn't need to be up *before* Order boots, just before you place an order.

A reasonable order, one terminal each:

```powershell
cd services/auth && npm run start:dev
cd services/catalog && npm run start:dev
cd services/order && npm run start:dev
cd services/payment && npm run start:dev
cd services/notification && npm run start:dev
cd gateway && npm run start:dev
```

Or start all six at once, each in its own window, from the repo root: `.\start-dev.ps1` (add `-Infra` to also `docker compose up -d` the infra stack first), or double-click `start-dev.cmd`.

Watch each terminal for its "Connected to RabbitMQ" / queue-bound log line — that's your confirmation each service's saga half is actually live, not just that the REST server started.

---

## 4. Verify each service is actually up

```powershell
curl http://localhost:3000/health    # Gateway
curl http://localhost:3001/auth/login -X POST   # Auth (expect a 400, not connection-refused)
curl http://localhost:3002/categories            # Catalog
curl http://localhost:3003/orders -H "Authorization: Bearer x"  # Order (expect 401, not connection-refused)
curl http://localhost:3004/wallets/me -H "Authorization: Bearer x"  # Payment (expect 401)
curl http://localhost:3005/notifications -H "Authorization: Bearer x"  # Notification (expect 401)
```

A connection-refused error means that service isn't actually listening — check its terminal for a crash before going further. An error response (400/401) is exactly what you want here; it means the server is up and its guards are working.

---

## 5. The real end-to-end test — watch the whole saga happen

Use the Gateway's Postman collection (`gateway/postman/MicroMart Gateway.postman_collection.json`) — it's written as one continuous flow. Do this with **all six terminals visible** so you can watch the saga cross services in real time.

1. **Register** a customer (`POST {{baseUrl}}/auth/register`) — watch Auth's terminal log the insert.
2. **Register** a second user, then promote it to admin directly in Postgres:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
   ```
3. **Login as admin and as customer** — both requests populate Postman variables automatically via the collection's test scripts.
4. **Create a category, then a product** (admin) — watch Catalog's terminal log the write and the Elasticsearch sync.
5. **Search for the product** (`GET /products?q=...`, no auth) — confirms Elasticsearch is actually serving reads, not just Postgres.
6. **Seed the customer's wallet** (admin) — paste the customer's user id (decode their JWT's `sub` claim at [jwt.io](https://jwt.io), or check `auth_db.users`) into the URL.
7. **Checkout** (`POST /orders`, customer token) — this is the moment. Gateway calls Order over gRPC. Watch, in order, across terminals:
   - **Order**: logs the created order (`status: pending`), publishes `order.created`.
   - **Catalog**: consumes it, reserves stock, publishes `stock.reserved`.
   - **Order**: consumes `stock.reserved`, flips to `awaiting_payment`.
   - **Payment**: consumes `stock.reserved`, debits the wallet, publishes `payment.succeeded`.
   - **Order**: consumes it, flips to `confirmed`, publishes `order.confirmed`.
   - **Notification**: consumes it, logs `[simulated email] Your order ... is confirmed`.
8. **Poll `GET /orders/:id`** a couple of times a second or two apart — you should see the status move `pending → awaiting_payment → confirmed` across those poll calls, proving the saga really is asynchronous and not faked.
9. **Check the payment** (`GET /payments/order/:orderId`) — this one goes over gRPC too, a second REST→gRPC example alongside checkout.
10. **Check notifications** (`GET /notifications`, admin, on Notification's own port `3005`) — confirms the log line you saw in step 7 was actually persisted, not just printed.

### Testing the failure/compensation path on purpose

Don't seed the wallet (or seed it with too little), then checkout again:
- **Payment** fails the debit, publishes `payment.failed`.
- **Order** flips to `cancelled`, publishes `order.payment_failed`.
- **Catalog** consumes that and **releases the reservation** — check `catalog_db.inventory` and you'll see `quantity_available` restored to what it was before the failed checkout.
- **Notification** logs the cancellation instead of the confirmation.

That compensating release is the actual point of building this as a saga instead of a single transaction — this is the one sequence worth deliberately triggering and watching, not just the happy path.

---

## 6. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Order stuck in `awaiting_payment` forever | The Catalog patch (section 0) wasn't applied — `stock.reserved` isn't carrying the amount/user Payment needs |
| 401 on a route that should work | `JWT_SECRET` mismatch between the issuing service (Auth) and the verifying one |
| Checkout fails immediately, before any saga events | Catalog isn't reachable — Order's synchronous `GetProduct` gRPC call at checkout time failed |
| A consumer never logs "Connected to RabbitMQ" | RabbitMQ container isn't up, or `RABBITMQ_URL` is wrong in that service's `.env` |
| Elasticsearch search returns nothing for a product you just created | Elasticsearch wasn't up yet when the product was created — re-save the product (a no-op `PATCH`) to trigger a re-index |
| `npm run prisma:generate` or `migrate` fails to reach a binary CDN | Only relevant if you're running in a network-restricted environment — works normally with regular internet access |

---

## 7. What's genuinely left

- **Observability wiring** — OTel SDK, Sentry, and actually shipping data into the running Grafana/Prometheus/Loki/Tempo stack. The infra is up; no service pushes to it yet.
- **CI/CD** — a GitHub Actions workflow (lint → test → build, gated merges) was planned but not written.
- **Local scaling** — Docker Compose `--scale` + an Nginx/Traefik load balancer in front of a scaled service, to actually exercise the "shared Redis cache across replicas" and "shared rate limit across replicas" behavior the design calls for.
- **A frontend** — out of scope by design; Postman/gRPC calls are the intended way to exercise this project.

Any of those four would be a reasonable "next" — observability is probably the most educational next step, since you already have working traces to actually look at once it's wired in.