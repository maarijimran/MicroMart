// PM2 process list for all six services — this is what lets a single
// `pm2 startOrReload` bring the whole system up, and what gives you an easy
// way to use more of your machine's cores (the original "how do I use my PC
// cores to make this faster" question from early in this project).
//
// Run from the REPO ROOT: `pm2 start infra/ecosystem.config.js`
// (the CI deploy job does exactly this — see .github/workflows/ci.yml)
//
// Each app's own .env file (in its `cwd`) still controls its PORT,
// DATABASE_URL, JWT_SECRET, etc. — PM2 only decides how many OS processes
// run that app and how they share a port.
//
// `instances` defaults to 1 (safe) everywhere below. To use more cores for
// a given service, bump `instances` and switch `exec_mode` to 'cluster' —
// but do this deliberately, not by just setting everything to 'max':
//   - Gateway is the best candidate to cluster aggressively (stateless,
//     no database of its own) — try instances: 'max' there first.
//   - Every other service opens its own Prisma connection pool per
//     instance. Clustering Catalog/Order/Payment/Notification/Auth to N
//     instances multiplies their DB connections by N — check Postgres's
//     max_connections (100 by default) before turning all five up at once.
//   - RabbitMQ consumers are safe to cluster: RabbitMQ's competing-consumers
//     pattern means each queued message still only goes to exactly one
//     instance, so clustering Order/Catalog/Payment/Notification is safe
//     from a correctness standpoint — the connection-pool math above is the
//     only real constraint.

// Gateway lives at the repo root (`gateway/`), not under `services/`.
const service = (name, port, extra = {}) => ({
  name,
  cwd: name === "gateway" ? "gateway" : `services/${name}`,
  script: "dist/main.js",
  instances: 1,
  exec_mode: "fork",
  env: { PORT: port },
  ...extra,
});

module.exports = {
  apps: [
    service("gateway", 3000),
    service("auth", 3001),
    service("catalog", 3002),
    service("order", 3003),
    service("payment", 3004),
    service("notification", 3005),
  ],
};
