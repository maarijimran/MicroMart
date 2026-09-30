# Frontend setup

A Next.js (App Router) frontend for MicroMart. Talks only to the Gateway — never to any other service directly, matching the architecture's "Gateway is the single front door" design.

## How it avoids CORS entirely

Every API call in this app goes to a relative path like `/api/products`. `next.config.ts` rewrites `/api/*` to the Gateway server-side (browser → Next.js server → Gateway), so the browser never makes a cross-origin request at all. This means Gateway's `CORS_ORIGIN` setting is irrelevant to this frontend — it only matters if you build something that talks to Gateway directly from a different origin.

## Prerequisites

- Node.js 24+ and npm
- Gateway (and everything behind it — Auth, Catalog, Order, Payment, Notification) already running

## Configure and run

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Runs on **`http://localhost:3006`** — deliberately not `:3000`, since that's already Gateway's default port (and Grafana's, if you're running the observability stack). `GATEWAY_URL` in `.env` should point at wherever Gateway actually is — `http://localhost:3000` for the normal native `npm run start:dev` workflow, or `http://localhost:8080` if you're running Gateway through the scaling patch's Nginx setup instead.

```powershell
npm run lint
npm run build
```

## A deliberate simplification worth knowing about

The JWT (access + refresh tokens) is stored in `localStorage`, not an httpOnly cookie. That's readable by any script running on the page — a real product would put a small server-side layer (a Next.js Route Handler acting as a BFF) between the browser and Gateway specifically to keep tokens out of JS-accessible storage. Skipped here on purpose to keep the auth flow easy to follow; `context/AuthContext.tsx` has a comment flagging exactly this trade-off at the point it happens.

## Manual test flow (mirrors the Postman collection, through the UI instead)

1. **Register** at `/register`, then **log in** at `/login`.
2. Register a second account and promote it to admin directly in Postgres (`UPDATE users SET role = 'admin' WHERE email = '...'`), then log in as that one too (a second browser profile or incognito window is the easiest way to be logged in as both at once).
3. As admin, go to **`/admin`** — create a category, then a product using that category's id (the form shows the created id after each step so you can copy it into the next).
4. As the customer, browse **`/`**, add the product to your cart, and check the **`/cart`** page.
5. Back as admin, copy the customer's user id (visible on their `/wallet` page if their wallet isn't seeded yet) and seed their wallet from the admin page.
6. As the customer, hit **Checkout** on `/cart` — you'll land on the new order's detail page.
7. **Watch `/orders/[id]`** — it polls every 2 seconds while the order is `pending`/`awaiting_payment`, and stops once it reaches `confirmed` or `cancelled`. This is the moment you're actually watching the choreographed saga play out across Catalog and Payment in real time, from the UI.
8. Check **`/wallet`** again — the balance should have dropped by the order total.

To deliberately see the failure/compensation path instead: skip step 5 (or seed too little) before checking out — the order should land on `cancelled`, and Catalog will have released the reservation behind the scenes.

## What's intentionally not built

- **No token refresh flow** — when the access token expires (15 minutes by default on Auth), API calls will start failing with 401 until you log in again. A real app would use the stored refresh token to get a new access token transparently; skipped here to keep `AuthContext` simple to read.
- **No order cancellation, product editing/deletion, or category editing UI** — the admin page only covers create category / create product / set stock / seed wallet, matching what those services' REST APIs expose as the "happy path" of this project.
- **No pagination controls** on the product grid or order list — they call the API's default page size and just show what comes back.
