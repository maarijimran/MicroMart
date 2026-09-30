# Notification Service setup

The last stop in the choreographed checkout saga. This service has no real functional REST or gRPC surface by design — it only consumes `order.confirmed` and `order.cancelled` and logs a simulated email. There's nothing downstream reacting to anything it does.

## Prerequisites

- Node.js 24+ and npm
- PostgreSQL, with an empty `notification_db` database created
- Docker Desktop for the shared Redis and RabbitMQ services
- Order Service running (this service reacts to its events; nothing calls Notification directly)

## Start shared infrastructure

```powershell
docker compose -f infra/docker-compose.yml up -d redis rabbitmq
```

## Configure and migrate

```powershell
cd services/notification
Copy-Item .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
```

Set `DATABASE_URL` to `notification_db` and `JWT_SECRET` to the same value as every other service — it's only used here to protect the one admin introspection route below.

## Run and verify

```powershell
npm run start:dev
npm run lint
npm test
npm run build
```

Listens on `http://localhost:3005` for the one introspection route. There's no gRPC port — main.ts doesn't call `connectMicroservice` at all, since there's no gRPC surface to expose.

## Why there's a database here at all

The project brief lists this service's database as optional. It's included here for the same reason Payment and Catalog have one: a durable idempotency backstop behind the Redis pre-check, via a unique constraint on `(order_id, event_type)` in `notifications_log`. Without it, a redelivered `order.confirmed` message would only be protected by Redis's TTL-bound key — fine most of the time, but not a real guarantee. With it, a duplicate delivery after the Redis key has expired still can't double-log, it just hits the unique constraint and gets treated as a no-op.

It also gives you something to actually look at — `GET /notifications` — to confirm the saga reached its end, without needing direct database access.

## REST API

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/notifications` | admin | List logged (simulated) notifications, most recent first |

## What you'll see in the logs

Watch this service's console after a checkout completes or gets cancelled elsewhere in the system — you'll see a line like:

```
[simulated email] Your order <id> is confirmed — thanks for shopping with MicroMart!
[simulated email] Your order <id> was cancelled (insufficient_funds).
```

That log line **is** the entire "send" implementation — there's no real email provider wired in anywhere in this project (see the project brief, section 1).

## Postman

Import `postman/MicroMart Notification.postman_collection.json`. There's really only one meaningful request in it — log in as admin, then list notifications — since this service has nothing else to call directly.
