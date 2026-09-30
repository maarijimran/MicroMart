# Auth Service setup

This service exposes REST endpoints for local testing and internal gRPC methods for the API Gateway. It uses your local PostgreSQL `auth_db` and Redis.

## Prerequisites

- Node.js 24+ and npm
- A local PostgreSQL instance with the `auth_db` schema already migrated
- Docker Desktop (only needed if you use Docker for Redis)

## Start Redis

From the repository root, start Redis from the shared stack:

```powershell
docker compose -f infra/docker-compose.yml up -d redis
```

You may instead point `REDIS_URL` at an existing local Redis instance.

## Configure and install

```powershell
cd services/auth
Copy-Item .env.example .env
npm install
npm run prisma:generate
```

Edit `.env` before starting the service. Set `DATABASE_URL` to your local PostgreSQL connection string for the already-migrated `auth_db`; for example:

```dotenv
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/auth_db?schema=public"
```

`JWT_SECRET` must be a private random value with at least 32 characters. Generate one with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Run and verify

```powershell
npm run start:dev
```

REST listens on `http://localhost:3001`; gRPC listens on `localhost:50051`.

```powershell
npm run lint
npm test
npm run build
```

When you later change the Prisma schema in local development, create a new migration with `npm run prisma:migrate -- --name describe-the-change`. Do not edit an already-applied migration.

## REST API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create a customer account. |
| POST | `/auth/login` | Obtain access and refresh JWTs. |
| POST | `/auth/refresh` | Rotate a refresh token. |
| POST | `/auth/logout` | Revoke a refresh token. |
| GET | `/auth/me` | Verify an access token and return its user. |

Passwords must contain at least eight characters, an uppercase letter, a number, and a special character. After four failed login attempts (configurable), Redis locks that email for 15 minutes by default.

## Postman

Import `postman/MicroMart Auth.postman_collection.json`. Set the collection's `baseUrl` variable if the port differs. The Login request automatically stores `accessToken` and `refreshToken`, so you can run the remaining requests in order.

## gRPC contract

The API Gateway should use [`../../proto/auth.proto`](../../proto/auth.proto). The service exposes `VerifyToken` and `GetUser`; it does not expose REST endpoints to other services in the intended architecture.
