# MicroMart — Project Brief for AI Coding Agents

You are helping build **MicroMart**, a small, deliberately scoped-down e-commerce backend whose entire purpose is to teach real-world backend/microservices concepts through implementation. It is a **learning project**, not a production system — favor clarity and idiomatic patterns over cleverness or premature optimization. Do not add scope beyond what's specified here without asking first.

---

## 1. Goals and constraints

- The point of this project is to hands-on practice: microservices architecture, event-driven design, the saga pattern, gRPC, REST, authentication/authorization, validation, caching, rate limiting, observability, and a CI pipeline — in a project small enough to actually finish.
- **Everything runs on the developer's local machine.** No cloud deployment, no Kubernetes, no managed services. Docker Compose is the deployment target.
- Deliberately kept to **4 microservices + 1 gateway**. Do not suggest splitting further or adding more services unless asked.
- "Local scaling" means: Node cluster mode / PM2 for multi-core use, Docker Compose `--scale` plus Nginx/Traefik as a load balancer for multiple replicas of one service, and optionally a small script that watches Prometheus metrics and calls `docker compose up --scale` — this is a learning simulation of autoscaling, not real autoscaling, and should never be described as production-grade.
- No real payment gateway, no real email delivery. Payment is a fake wallet-balance system. Notifications are logged, not sent.

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript |
| Framework | NestJS, with the **Fastify** adapter (not Express) |
| Inter-service communication | gRPC (protobuf contracts) |
| Client-facing API | REST, via a single API gateway |
| Async messaging / events | RabbitMQ |
| Cache / rate limiting / idempotency | Redis |
| ORM | Prisma |
| Database | PostgreSQL — **one database per service** (`auth_db`, `catalog_db`, `order_db`, `payment_db`) |
| Search | Elasticsearch (Catalog service only) |
| Validation | Zod, at the API gateway boundary |
| Auth | JWT (access + refresh), bcrypt password hashing, RBAC (`customer` / `admin`) |
| Observability — tracing | OpenTelemetry SDK per service → Tempo |
| Observability — metrics | OpenTelemetry / Prometheus |
| Observability — logs | Pino/Winston → Loki (via Promtail or a direct transport) |
| Observability — dashboards | Grafana, unifying Tempo + Prometheus + Loki |
| Error tracking | Sentry (exception capture/alerting only — not a replacement for the OTel stack) |
| Local orchestration | Docker Compose |
| Load balancing | Nginx or Traefik in front of scaled replicas |
| CI | GitHub Actions: lint → test (Testcontainers for Postgres/Redis) → build. Merges to `main` gated on tests passing. A self-hosted runner on the developer's own machine rebuilds/restarts the Compose stack as the "deployment" step — there is no cloud deployment. |

---

## 3. Architecture overview

```
Client (browser/Postman)
  → REST → API Gateway (NestJS/Fastify)
       - Zod validation on all incoming DTOs
       - CORS restricted to the frontend origin
       - Redis-backed rate limiting (global + tighter on /auth/login, /auth/register)
       - Translates REST calls into gRPC calls to the services below
       - Propagates a trace/correlation ID header through gRPC and into event payloads

  → gRPC → Auth Service       (owns auth_db)
  → gRPC → Catalog Service    (owns catalog_db, syncs to Elasticsearch)
  → gRPC → Order Service      (owns order_db)

Order, Catalog and Payment also communicate asynchronously via RabbitMQ,
choreographing the checkout saga (see Section 5). Notification Service
only consumes events — it has no REST or gRPC surface and no database
of its own beyond an optional idempotency log.
```

Services never call another service's database directly. Cross-service references (e.g. an `order.user_id` pointing at a row in `auth_db`) are stored as plain UUIDs with **no foreign key** — the relationship is enforced by the owning service's API/events, not by SQL constraints.

---

## 4. Services in detail

### 4.1 API Gateway
- No database of its own.
- Responsibilities: REST surface, Zod validation, CORS, rate limiting, JWT verification (calls Auth's `VerifyToken` gRPC method or verifies locally against a cached JWKS/secret), routing to the right service over gRPC.
- Caches public read-heavy responses (e.g. product listings) in Redis with a short TTL, invalidated on writes.

### 4.2 Auth Service
Owns `auth_db`.

**Functional requirements**
- FR1 — Register with email + password. Password must be ≥8 characters with at least 1 uppercase letter, 1 number, and 1 special character (Zod-enforced).
- FR2 — Login issues a short-lived JWT access token and a longer-lived refresh token.
- FR3 — Refresh-token rotation: each use invalidates the old refresh token and issues a new pair. Logout revokes the current refresh token.
- FR4 — Lock the account for a cooldown period after 3–4 consecutive failed login attempts, tracked in Redis (see Section 6.2).
- FR5 — RBAC: `customer` vs `admin` roles, enforced via a claim in the JWT and checked by gateway/service guards.
- FR6 — Internal gRPC methods: `VerifyToken`, `GetUser` — used by the gateway and by Order Service.

**Schema — `auth_db`**

`users`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| email | citext, unique, not null | |
| password_hash | text, not null | bcrypt |
| role | enum(`customer`,`admin`), not null, default `customer` | |
| first_name | text | |
| last_name | text | |
| is_active | boolean, not null, default true | soft-disable, never hard-delete |
| failed_login_attempts | int, not null, default 0 | reset to 0 on successful login |
| locked_until | timestamptz, nullable | checked on every login attempt |
| created_at | timestamptz, not null, default now() | |
| updated_at | timestamptz, not null | |

`refresh_tokens`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, FK → users.id, not null | |
| token_hash | text, not null | store a hash, never the raw token |
| expires_at | timestamptz, not null | |
| revoked_at | timestamptz, nullable | set on rotation/logout |
| created_at | timestamptz, not null | |

Indexes: `users(email)` unique; `refresh_tokens(user_id)`; `refresh_tokens(token_hash)` unique.

### 4.3 Catalog Service
Owns `catalog_db`, syncs to Elasticsearch.

**Functional requirements**
- FR1 — Admin CRUD on products and categories.
- FR2 — Public paginated/filterable browse and search, served from Elasticsearch (not Postgres directly).
- FR3 — `CheckAvailability(productId, qty)` gRPC method.
- FR4 — Consume `order.created`: for each line item, attempt to reserve the requested quantity only if `quantity_available ≥ qty`. Publish `stock.reserved` if every line succeeds; publish `stock.reservation_failed` (naming the offending item) if any line fails, and roll back any reservations already made for that same order before publishing the failure.
- FR5 — Consume `order.cancelled` / `order.payment_failed`: release the matching reservation(s) — this is the saga's compensating action.
- FR6 — Reindex the affected product in Elasticsearch on every create/update, ideally itself event-driven (`product.created`/`product.updated`) rather than a synchronous call inline with the write.

**Schema — `catalog_db`**

`categories`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| name | text, not null | |
| slug | text, unique, not null | |
| parent_id | uuid, FK → categories.id, nullable | self-referencing, for subcategories |
| created_at | timestamptz, not null | |

`products`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| category_id | uuid, FK → categories.id, not null | |
| sku | text, unique, not null | |
| name | text, not null | |
| slug | text, unique, not null | |
| description | text | |
| price | numeric(10,2), not null | |
| currency | char(3), not null, default 'USD' | |
| is_active | boolean, not null, default true | |
| created_at | timestamptz, not null | |
| updated_at | timestamptz, not null | |

`inventory` (1:1 with products — split out because it's a hot write path)
| column | type | notes |
|---|---|---|
| product_id | uuid, PK, FK → products.id | |
| quantity_available | int, not null, default 0 | sellable stock |
| quantity_reserved | int, not null, default 0 | held by in-flight sagas |
| updated_at | timestamptz, not null | |

`inventory_reservations` (audit trail + compensation source of truth)
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| order_id | uuid, not null | cross-service reference, no FK |
| product_id | uuid, FK → products.id, not null | |
| quantity | int, not null | |
| status | enum(`pending`,`confirmed`,`released`), not null, default `pending` | |
| created_at | timestamptz, not null | |
| updated_at | timestamptz, not null | |

Indexes: `products(category_id)`; `products(sku)` unique; `inventory_reservations(order_id)`; unique `(order_id, product_id)` on `inventory_reservations` for idempotent reservation processing.

**Elasticsearch document (product index)**: `product_id`, `name`, `description`, `category_name`, `price`, `is_active`.

### 4.4 Order Service
Owns `order_db`. This is the service most other services react to — it kicks off and terminates the saga.

**Functional requirements**
- FR1 — Create an order from a cart payload (line items + quantities); starts in `pending`.
- FR2 — Snapshot product name and price into `order_items` at creation time — never re-derive historical order data from Catalog's current values.
- FR3 — React to saga events and transition order status accordingly (see Section 5 for the full event sequence).
- FR4 — List a user's own orders; admins can list all orders.
- FR5 — Idempotent event consumption keyed on `(order_id, event_type)`.
- FR6 — Persist every saga transition — both events it publishes and events it consumes — to an append-only audit log. Because this is a choreographed saga (no central orchestrator), this log is the only way to reconstruct what happened to a given order.

**Schema — `order_db`**

`orders`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, not null | cross-service reference, no FK |
| status | enum(`pending`,`awaiting_payment`,`confirmed`,`cancelled`), not null, default `pending` | |
| total_amount | numeric(10,2), not null | |
| currency | char(3), not null | |
| created_at | timestamptz, not null | |
| updated_at | timestamptz, not null | |

`order_items`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| order_id | uuid, FK → orders.id, not null | |
| product_id | uuid, not null | cross-service reference |
| product_name_snapshot | text, not null | frozen at order time |
| unit_price_snapshot | numeric(10,2), not null | frozen at order time |
| quantity | int, not null | |
| subtotal | numeric(10,2), not null | |

`saga_events` (append-only)
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| order_id | uuid, FK → orders.id, not null | |
| event_type | text, not null | e.g. `order.created`, `stock.reserved` |
| direction | enum(`published`,`consumed`), not null | |
| payload | jsonb, not null | |
| created_at | timestamptz, not null | |

Indexes: `orders(user_id)`; `orders(status)`; `order_items(order_id)`; `saga_events(order_id, event_type)`.

### 4.5 Payment Service (fake)
Owns `payment_db`. No real payment gateway — a simulated wallet balance.

**Functional requirements**
- FR1 — Each user has a seeded wallet balance (seed via an event when the user registers, or via an admin/seed script for the learning project).
- FR2 — Consume `stock.reserved`: attempt to debit the wallet for the order total. Publish `payment.succeeded` or `payment.failed` (e.g. `insufficient_funds`, or an intentionally randomized failure rate to exercise the compensation path).
- FR3 — Record every attempt — success or failure — for audit/history.
- FR4 — Idempotent: a redelivered `stock.reserved` for an already-processed order must never double-charge.

**Schema — `payment_db`**

`wallets`
| column | type | notes |
|---|---|---|
| user_id | uuid, PK | cross-service reference, no FK |
| balance | numeric(10,2), not null, default 0 | |
| currency | char(3), not null | |
| updated_at | timestamptz, not null | |

`payments`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| order_id | uuid, not null, **unique** | cross-service reference; the uniqueness constraint is what makes this idempotent under at-least-once delivery |
| user_id | uuid, not null | |
| amount | numeric(10,2), not null | |
| currency | char(3), not null | |
| status | enum(`succeeded`,`failed`), not null | |
| failure_reason | text, nullable | |
| created_at | timestamptz, not null | |

### 4.6 Notification Service
Stateless consumer. No REST or gRPC surface.

**Functional requirements**
- FR1 — Consume `order.confirmed` / `order.cancelled` and log a simulated email (do not implement real email delivery).
- FR2 — Idempotent delivery via an optional `notifications_log` table: `id`, `event_type`, `order_id`, `user_id`, `status`, `created_at`, with a unique constraint on `(order_id, event_type)`.

---

## 5. Saga — choreographed checkout (no central orchestrator)

Every service reacts to events independently and publishes its own outcome events. There is no coordinator service.

```
1. Client → Gateway → Order.createOrder (gRPC)
2. Order      creates order (status=pending)                → publishes order.created {order_id, user_id, items[]}
3. Catalog    consumes order.created, reserves stock         → publishes stock.reserved {order_id, items[]}
                                                                 or stock.reservation_failed {order_id, item, reason}
4. Order      consumes stock.reserved            → status=awaiting_payment
              consumes stock.reservation_failed   → status=cancelled → publishes order.cancelled {order_id, reason}
5. Payment    consumes stock.reserved, debits wallet          → publishes payment.succeeded {order_id, payment_id}
                                                                 or payment.failed {order_id, reason}
6. Order      consumes payment.succeeded → status=confirmed → publishes order.confirmed {order_id}
              consumes payment.failed    → status=cancelled → publishes order.payment_failed {order_id, reason}
7. Catalog    consumes order.cancelled / order.payment_failed → releases the matching reservation (compensation)
8. Notification consumes order.confirmed / order.cancelled    → logs a simulated notification
```

Rules that must hold:
- Every event payload includes `order_id` and enough context for the consumer to act without a follow-up call.
- Every consumer must be idempotent (see Section 6.4) — RabbitMQ delivery is at-least-once, duplicates **will** happen.
- Catalog is the only service with an undo step (`release`), because it's the only one left holding a resource (reserved stock) that a later step can invalidate. Payment either succeeds or fails outright in this scope — there is no payment refund path.
- Order Service's `saga_events` table is the canonical place to look when debugging a stuck or failed order — there is no orchestrator log to check instead.

---

## 6. Redis — role by layer

Redis is used for five distinct purposes. Keep these conceptually separate in implementation even though it may be one Redis instance.

### 6.1 Rate limiting (Gateway)
- Sliding-window/token-bucket counters per IP or user, e.g. key `ratelimit:{route}:{ip}` via `INCR` + `EXPIRE`. Tighter limits on `/auth/login` and `/auth/register`.
- Must be Redis-backed (not in-memory) because the gateway may run as multiple replicas behind a load balancer — an in-memory counter per replica would let each replica independently allow the full limit.

### 6.2 Account lockout (Auth)
- `login-fail:{email}` counter via `INCR` + `EXPIRE` (TTL = cooldown window). Block login attempts once the counter hits 3–4. The TTL is the unlock mechanism — no separate unlock job.
- On successful login, `DEL` the key immediately rather than waiting for the TTL.

### 6.3 Refresh-token revocation (Auth)
- On rotation/logout: `SET revoked:{token_id} 1 EX <seconds-until-original-expiry>`.
- Token validation checks this key first; if present, reject even if the JWT is still cryptographically valid. The TTL means the blacklist self-cleans.

### 6.4 Event idempotency (Catalog, Payment, Notification) — highest priority to implement correctly
- Before acting on a consumed event: `SET processed:{order_id}:{event_type} 1 NX EX <ttl>`. If the `SET NX` fails, the event has already been handled — skip.
- Applies to: Catalog reserving stock on `order.created`, Payment charging on `stock.reserved`, Notification logging on `order.confirmed`/`order.cancelled`.
- This is a fast pre-check; the real correctness backstop is a DB-level unique constraint (e.g. `payments.order_id` unique) — implement both.

### 6.5 Request idempotency (Gateway/Order)
- Client sends an `Idempotency-Key` header on checkout. Order does `SET idempotency:{key} {order_id} NX EX <ttl>` before creating the order; if the key exists, return the existing order instead of creating a duplicate.
- Distinct from 6.4: this guards against duplicate *client* requests, not duplicate *event deliveries*.

### 6.6 Read-through caching (Catalog)
- Cache-aside for `GET /products`, `GET /products/:id`, and the category tree — JSON strings with a short TTL (e.g. 60s).
- Invalidate (`DEL`) on write rather than relying solely on TTL expiry.
- Shared across all Catalog replicas — this is what makes horizontally scaling Catalog behave consistently.

### 6.7 (Optional/stretch) Distributed lock — Catalog stock reservation
- The correctness guarantee for "don't oversell" must come from a Postgres row-level lock inside the reservation transaction — implement that first, always.
- A Redlock-style Redis lock (`SET lock:{product_id} {token} NX PX <ms>`) may be added on top purely as a learning exercise in distributed locking. It is not a substitute for the DB-level guarantee.

---

## 7. Validation and security specifics

- All Zod schemas live at the gateway boundary — reject malformed input before it reaches any gRPC call.
- Password rule: minimum 8 characters, at least 1 uppercase letter, 1 number, 1 special character.
- Passwords hashed with bcrypt; never logged, never returned in any response.
- JWT access token: short-lived (e.g. 15 min). Refresh token: longer-lived (e.g. 7 days), rotated on every use, revocable.
- RBAC roles: `customer`, `admin`. Enforce via a NestJS guard reading the JWT role claim.
- CORS restricted to the known frontend origin — not wildcard.
- A correlation/trace ID should be generated at the gateway and propagated through gRPC metadata and into every RabbitMQ event payload, so a single checkout can be traced end-to-end across all five services in Tempo/Grafana.

---

## 8. Observability wiring

- Every service instruments itself with the OpenTelemetry SDK (auto-instrumentation for HTTP, gRPC, and Prisma where available).
- Traces export to Tempo; metrics export to Prometheus (via OTel Collector or direct scrape); logs go to Loki via a Pino/Winston transport or Promtail.
- Grafana is the single pane of glass — dashboards should let you pick a trace ID and see the request cross Gateway → Order → Catalog/Payment → Notification.
- Sentry captures unhandled exceptions per service for alerting — it is not a substitute for the tracing/metrics/logging stack, it's a separate "something broke" signal.

---

## 9. Local scaling and CI/CD

- Use Node's `cluster` module or PM2 in cluster mode per service to use multiple CPU cores.
- Use `docker compose up --scale <service>=N` with Nginx or Traefik in front for load-balanced replicas of a given service.
- Optionally, a small script polling Prometheus metrics (e.g. request rate) that calls `docker compose up --scale` when a threshold is crossed — framed explicitly as a learning simulation of autoscaling, not a production mechanism.
- CI: GitHub Actions on every push/PR — install, lint, run tests (Testcontainers spinning up real throwaway Postgres/Redis rather than mocks). Merges to `main` are gated on tests passing.
- "Deployment": a self-hosted GitHub Actions runner on the developer's own machine rebuilds Docker images and restarts the Compose stack on merge to `main`. There is no cloud deployment step anywhere in this project.

---

## 10. Explicitly out of scope

Do not add, unless the developer explicitly asks:
- Additional microservices beyond the 5 described (Gateway, Auth, Catalog, Order, Payment, Notification).
- A real payment gateway integration.
- Real email/SMS delivery.
- Cloud deployment, Kubernetes, or managed database/queue services.
- A central saga orchestrator — the saga is choreographed by design, as a deliberate contrast to the orchestration pattern.
- Multi-region, multi-tenant, or i18n concerns.