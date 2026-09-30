# Load testing

Automated load tests for the API gateway, using [k6](https://k6.io).

```powershell
.\loadtest\run.ps1                                  # smoke: 5 users, 30 s
.\loadtest\run.ps1 -Profile load                    # 100 concurrent shoppers
.\loadtest\run.ps1 -Profile stress                  # ramp 50 → 2,000 req/s to find the breaking point
.\loadtest\run.ps1 -Profile spike                   # sudden jump to 1,500 req/s
.\loadtest\run.ps1 -Profile steady -Rate 300 -Duration 2m
.\loadtest\run.ps1 -Profile soak                    # 100 users for 15 min (memory leaks, slow degradation)
.\loadtest\run.ps1 -Profile ratelimit               # proves the per-IP limiter returns 429
```

Needs: services running (`.\start-dev.ps1`) and the gateway built (`gateway\dist`). k6 is used from `PATH`,
or downloaded once into `loadtest\.bin`. Exit code is non-zero when a threshold fails, so the runner can gate CI.

## What the test does

- **Traffic:** read-only shopper behaviour. Searches with random terms, filters, sorts and pages (50%), product pages (30%),
  category lists (15%), health checks (5%). Nothing is written, so it's safe against real data.
- **Pass criteria:** under 1% errors, p95 under 500 ms, p99 under 1.5 s, with per-endpoint limits in `api-load.js`.
- **Why a separate gateway:** all k6 traffic comes from one IP, so the real gateway's per-IP limit (100/min) would
  reject almost everything. `run.ps1` starts a second gateway on `:3099` with the limit raised and its own Redis
  database, so your normal gateway and browsing are untouched. `-Profile ratelimit` tests the limiter itself.
- **Results:** a summary is printed. Full JSON and a per-request CSV timeline are saved to `loadtest\results\`.

## Baseline results (30 Sep 2026)

Setup: one laptop (4 logical cores, Docker Desktop with 7.7 GB). Each service runs as a single Node process in
dev/watch mode. Elasticsearch, Redis and RabbitMQ run in Docker. **k6 runs on the same machine** and competes
for the same CPU, so these numbers are a floor, not a ceiling.

| Offered load | Errors | Median | p95 |
|---|---|---|---|
| ≤ 340 req/s | 0% | 10–25 ms | < 150 ms |
| ~400 req/s (steady, 70 s) | 0% | — | 804 ms |
| ~480 req/s | 0% | 140–585 ms | 0.5–1.1 s |
| ≥ 545 req/s | 21% rising to 70%+ | — | 3–11 s |

- **Comfortable capacity:** about 340 req/s within the 500 ms p95 target.
- **Hard ceiling:** about 450–490 successful req/s. Past it, the gateway refuses new connections (k6 error
  1212, "connection refused"). No request returned wrong data; requests either succeeded or were refused.
- **Bottleneck:** the gateway. At 400 req/s its single Node process used ~77% of one core, and even `/health`
  (no downstream call) had a 253 ms p95, meaning requests were queuing in its event loop. Catalog used ~38% of a
  core and Elasticsearch about half a core.
- **Rate limiter:** one client sending as fast as possible got ~100 requests through. The remaining 98% were
  rejected with 429 in about 2 ms each.

## What "100,000 users" would take

Concurrent users aren't requests per second. A shopper makes a request every few seconds (reading, scrolling),
so **100,000 concurrent users ≈ 10,000–30,000 req/s**, depending on behaviour.

One machine can't show that. Your laptop tops out around 340–480 req/s, and a single Windows load generator
runs out of connections (~16,000 ephemeral ports) long before 100K users. Getting there takes roughly
**30–90× today's capacity**, in this order of impact:

1. **Run many gateway replicas.** The gateway is the first wall. Use Node cluster mode / PM2 per machine plus
   `docker compose --scale` or Kubernetes behind a load balancer.
2. **Cache public reads.** Product listings and categories are the bulk of traffic and are identical for everyone.
   Cache them (Redis at the gateway, which the project brief already calls for, or a CDN) so most requests never
   reach Catalog or Elasticsearch.
3. **Scale Catalog and Elasticsearch next.** Add Catalog replicas and a multi-node Elasticsearch cluster.
4. **Test it properly.** Use distributed load generation (k6 Cloud, or k6 on several machines) against a
   production-like environment, not a dev laptop.
