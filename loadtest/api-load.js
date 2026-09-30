// k6 load test for the MicroMart API gateway — read-only browsing traffic.
//
//   k6 run -e PROFILE=smoke  loadtest/api-load.js
//   k6 run -e PROFILE=load   -e BASE_URL=http://localhost:3099 loadtest/api-load.js
//   k6 run -e PROFILE=stress -e BASE_URL=http://localhost:3099 loadtest/api-load.js
//
// Profiles (see PROFILES below): smoke, load, stress, spike, soak.
// Every virtual user (VU) behaves like a shopper: search, open a product,
// browse categories, with short think-time pauses in between. Nothing here
// writes data, so it's safe to run against a database you care about.
//
// NOTE: the gateway rate-limits per client IP (RATE_LIMIT_MAX per window).
// All k6 traffic comes from one IP, so capacity tests must target a gateway
// started with a raised limit — see loadtest/README.md. Run PROFILE=ratelimit
// against the normal gateway to verify the limiter itself.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PROFILE = __ENV.PROFILE || 'smoke';
const THINK_TIME = Number(__ENV.THINK_TIME ?? 1); // seconds between a shopper's actions

// Arrival-rate profiles drive a fixed number of *requests per second*
// regardless of how slow the server gets — that's what exposes the real limit.
const PROFILES = {
  smoke: { executor: 'constant-vus', vus: 5, duration: '30s' },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 100 },
      { duration: '1m', target: 100 },
      { duration: '15s', target: 0 },
    ],
  },
  stress: {
    executor: 'ramping-arrival-rate',
    startRate: 50,
    timeUnit: '1s',
    preAllocatedVUs: 200,
    maxVUs: 3000,
    stages: [
      { duration: '30s', target: 200 },
      { duration: '30s', target: 500 },
      { duration: '30s', target: 1000 },
      { duration: '30s', target: 1500 },
      { duration: '30s', target: 2000 },
      { duration: '15s', target: 0 },
    ],
  },
  spike: {
    executor: 'ramping-arrival-rate',
    startRate: 20,
    timeUnit: '1s',
    preAllocatedVUs: 200,
    maxVUs: 3000,
    stages: [
      { duration: '20s', target: 20 },
      { duration: '5s', target: 1500 },
      { duration: '30s', target: 1500 },
      { duration: '5s', target: 20 },
      { duration: '20s', target: 20 },
    ],
  },
  // Hold one fixed request rate: -e RATE=400 -e DURATION=1m
  steady: {
    executor: 'constant-arrival-rate',
    rate: Number(__ENV.RATE ?? 300),
    timeUnit: '1s',
    duration: __ENV.DURATION ?? '1m',
    preAllocatedVUs: 200,
    maxVUs: 3000,
  },
  soak: { executor: 'constant-vus', vus: 100, duration: '15m' },
  ratelimit: { executor: 'constant-vus', vus: 1, duration: '10s' },
};

if (!PROFILES[PROFILE]) throw new Error(`Unknown PROFILE "${PROFILE}". Use one of: ${Object.keys(PROFILES).join(', ')}`);

const isArrivalRate = PROFILES[PROFILE].executor.includes('arrival-rate');

export const options = {
  scenarios: { [PROFILE]: { ...PROFILES[PROFILE], exec: PROFILE === 'ratelimit' ? 'rateLimit' : 'shopper' } },
  // Pass/fail criteria. A run "fails" (non-zero exit code) if these break,
  // so this can gate CI or a pre-release check.
  thresholds:
    PROFILE === 'ratelimit'
      ? {}
      : {
          http_req_failed: ['rate<0.01'], // < 1% errors
          http_req_duration: ['p(95)<500', 'p(99)<1500'], // ms
          'http_req_duration{endpoint:search}': ['p(95)<800'],
          'http_req_duration{endpoint:product}': ['p(95)<300'],
          'http_req_duration{endpoint:categories}': ['p(95)<300'],
          'http_req_duration{endpoint:health}': ['p(95)<100'],
        },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: false,
};

const rateLimited = new Rate('rate_limited');
const searchLatency = new Trend('search_latency', true);

const TERMS = ['mouse', 'keyboard', 'headphones', 'monitor', 'wireless', 'usb', 'gaming', 'laptop', 'cable', 'pro'];
const SORTS = ['relevance', 'price_asc', 'price_desc'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Runs once: discover real product and category ids so requests hit real data.
export function setup() {
  const categories = http.get(`${BASE_URL}/categories`).json() ?? [];
  const products = http.get(`${BASE_URL}/products?pageSize=100`).json()?.results ?? [];
  if (products.length === 0) console.warn('No products found — product-page requests will be skipped.');
  return {
    categoryIds: categories.map((c) => c.id),
    productIds: products.map((p) => p.productId),
  };
}

export function shopper(data) {
  const pause = () => {
    if (!isArrivalRate && THINK_TIME > 0) sleep(Math.random() * THINK_TIME * 2);
  };

  // Arrival-rate profiles: each iteration is ONE request, weighted like real
  // traffic. VU profiles: each iteration is a short browsing session.
  const roll = Math.random();
  if (isArrivalRate) {
    if (roll < 0.5) return search(data);
    if (roll < 0.8) return product(data);
    if (roll < 0.95) return categories();
    return health();
  }

  group('browse', () => {
    categories();
    pause();
    search(data);
    pause();
    product(data);
    pause();
    if (roll < 0.3) {
      search(data);
      pause();
    }
  });
}

function search(data) {
  const params = new URLSearchParamsLite();
  if (Math.random() < 0.7) params.set('q', pick(TERMS));
  if (data.categoryIds.length && Math.random() < 0.3) params.set('categoryId', pick(data.categoryIds));
  if (Math.random() < 0.2) params.set('maxPrice', String(50 + Math.floor(Math.random() * 500)));
  params.set('sort', pick(SORTS));
  params.set('page', String(1 + Math.floor(Math.random() * 3)));
  const res = http.get(`${BASE_URL}/products?${params}`, { tags: { endpoint: 'search', name: 'GET /products' } });
  searchLatency.add(res.timings.duration);
  record(res, 'search', (r) => Array.isArray(r.json('results')));
}

function product(data) {
  if (data.productIds.length === 0) return;
  const res = http.get(`${BASE_URL}/products/${pick(data.productIds)}`, { tags: { endpoint: 'product', name: 'GET /products/:id' } });
  record(res, 'product', (r) => typeof r.json('id') === 'string');
}

function categories() {
  const res = http.get(`${BASE_URL}/categories`, { tags: { endpoint: 'categories', name: 'GET /categories' } });
  record(res, 'categories', (r) => Array.isArray(r.json()));
}

function health() {
  const res = http.get(`${BASE_URL}/health`, { tags: { endpoint: 'health', name: 'GET /health' } });
  record(res, 'health', () => true);
}

function record(res, name, bodyCheck) {
  rateLimited.add(res.status === 429);
  check(res, {
    [`${name}: status 200`]: (r) => r.status === 200,
    [`${name}: valid body`]: (r) => r.status === 200 && bodyCheck(r),
  });
}

// Verifies the per-IP limiter: one client hammering the real gateway should
// start receiving 429 once it passes RATE_LIMIT_MAX in the window.
export function rateLimit() {
  const res = http.get(`${BASE_URL}/categories`, { tags: { endpoint: 'ratelimit' } });
  rateLimited.add(res.status === 429);
  check(res, { 'status is 200 or 429': (r) => r.status === 200 || r.status === 429 });
}

export function handleSummary(summary) {
  const m = summary.metrics;
  const val = (name, stat) => m[name]?.values?.[stat];
  const fmt = (n, d = 0) => (n === undefined ? '-' : Number(n).toFixed(d));
  const endpoint = (e) => {
    const hit = val(`http_req_duration{endpoint:${e}}`, 'max') > 0; // endpoints this profile never called read as 0
    return `${e.padEnd(11)} p95 ${(hit ? fmt(val(`http_req_duration{endpoint:${e}}`, 'p(95)'), 1) : '-').padStart(8)} ms`;
  };
  const lines = [
    '',
    `MicroMart load test — profile "${PROFILE}" against ${BASE_URL}`,
    '─'.repeat(64),
    `requests            ${fmt(val('http_reqs', 'count'))}`,
    `throughput          ${fmt(val('http_reqs', 'rate'), 1)} req/s`,
    `failed requests     ${fmt((val('http_req_failed', 'rate') ?? 0) * 100, 2)} %`,
    `rate-limited (429)  ${fmt((val('rate_limited', 'rate') ?? 0) * 100, 2)} %`,
    `latency avg / p95 / p99 / max   ${fmt(val('http_req_duration', 'avg'), 1)} / ${fmt(val('http_req_duration', 'p(95)'), 1)} / ${fmt(val('http_req_duration', 'p(99)'), 1)} / ${fmt(val('http_req_duration', 'max'), 1)} ms`,
    `peak concurrent VUs ${fmt(val('vus_max', 'max'))}`,
    `dropped iterations  ${fmt(val('dropped_iterations', 'count') ?? 0)}  (k6 couldn't start them on time — server too slow)`,
    '',
    ...['search', 'product', 'categories', 'health'].map(endpoint),
    '',
  ];
  const name = `loadtest-${PROFILE}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  return {
    stdout: lines.join('\n') + '\n',
    [`${__ENV.RESULTS_DIR || '.'}/${name}`]: JSON.stringify(summary, null, 2),
  };
}

// k6's JS runtime has no URLSearchParams; this covers what we need.
function URLSearchParamsLite() {
  const entries = [];
  this.set = (k, v) => entries.push([k, v]);
  this.toString = () => entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}
