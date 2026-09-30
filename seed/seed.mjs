// Seeds synthetic data: 25 users (1 admin + 24 customers, each with a funded
// wallet) and 100 products across 10 categories, with real product photos.
//
//   node seed/seed.mjs
//
// Needs the services running (.\start-dev.ps1) and internet access (product
// data and photos come from https://dummyjson.com, a free test-data API).
//
// Talks to the services directly — not through the gateway, whose per-IP rate
// limit would throttle a bulk import. Safe to re-run: existing users, categories
// and products are skipped, and passwords are reused from seed/seed-users.json.
//
// Credentials for every account are written to seed/seed-users.json
// (git-ignored — these are real, working logins for your local stack).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomInt } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const require = createRequire(import.meta.url);

const AUTH_URL = process.env.AUTH_URL ?? 'http://127.0.0.1:3001';
const CATALOG_URL = process.env.CATALOG_URL ?? 'http://127.0.0.1:3002';
const PAYMENT_URL = process.env.PAYMENT_URL ?? 'http://127.0.0.1:3004';
const CREDENTIALS_FILE = join(here, 'seed-users.json');
const PRODUCTS_PER_CATEGORY = 10;
const MAX_IMAGES = 5;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const PEOPLE = [
  ['Store', 'Admin'], ['Aisha', 'Khan'], ['Liam', 'Carter'], ['Sofia', 'Rossi'], ['Omar', 'Farouk'],
  ['Mei', 'Chen'], ['Lucas', 'Silva'], ['Emma', 'Johansson'], ['Arjun', 'Mehta'], ['Fatima', 'Zahra'],
  ['Noah', 'Williams'], ['Yuki', 'Tanaka'], ['Hannah', 'Schmidt'], ['Bilal', 'Ahmed'], ['Chloe', 'Dubois'],
  ['Daniel', 'Okafor'], ['Isabella', 'Garcia'], ['Hamza', 'Malik'], ['Olivia', 'Brown'], ['Mateo', 'Fernandez'],
  ['Zara', 'Hussain'], ['Ethan', 'Nguyen'], ['Amelia', 'Kowalski'], ['Yusuf', 'Demir'], ['Grace', 'Mensah'],
];

function strongPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_+='];
  const all = sets.join('');
  const chars = sets.map((set) => set[randomInt(set.length)]); // one of each required class
  while (chars.length < 14) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function loadUsers() {
  const saved = existsSync(CREDENTIALS_FILE) ? JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8')).users : [];
  return PEOPLE.map(([firstName, lastName], index) => {
    const email = `${firstName}.${lastName}`.toLowerCase() + '@example.com';
    const existing = saved.find((u) => u.email === email);
    return {
      firstName,
      lastName,
      email,
      password: existing?.password ?? strongPassword(),
      role: index === 0 ? 'admin' : 'customer',
      walletBalance: existing?.walletBalance ?? (index === 0 ? 10000 : 250 * randomInt(2, 21)),
      accountId: existing?.accountId ?? null,
    };
  });
}

function saveUsers(users) {
  const file = {
    _note:
      'Synthetic test accounts created by seed/seed.mjs for the LOCAL development stack only. ' +
      'Emails use example.com (reserved for testing). Never reuse these passwords anywhere real.',
    generatedAt: new Date().toISOString(),
    users: users.map(({ firstName, lastName, email, password, role, accountId, walletBalance }) => ({
      name: `${firstName} ${lastName}`,
      email,
      password,
      role,
      accountId,
      walletBalance,
    })),
  };
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(file, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function call(method, url, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: json ? JSON.stringify(json) : form });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const describe = (r) => `${r.status} ${JSON.stringify(r.body?.errors?.fieldErrors ?? r.body?.message ?? r.body)}`;

async function login(email, password) {
  const r = await call('POST', `${AUTH_URL}/auth/login`, { json: { email, password } });
  if (r.status !== 200 && r.status !== 201) throw new Error(`Login failed for ${email}: ${describe(r)}`);
  return r.body;
}

function readEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

// Auth has no API for changing roles (by design), so the admin is promoted with
// the same SQL the setup guide uses.
async function promoteToAdmin(email) {
  const { Client } = require(join(repo, 'services/auth/node_modules/pg'));
  const db = new Client({ connectionString: readEnv(join(repo, 'services/auth/.env')).DATABASE_URL });
  await db.connect();
  try {
    await db.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [email]);
  } finally {
    await db.end();
  }
}

// ---------------------------------------------------------------------------
// Catalog: 10 store categories, each built from one or more DummyJSON ones
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { name: 'Smartphones & Tablets', slug: 'smartphones-tablets', from: ['smartphones', 'tablets'] },
  { name: 'Electronics', slug: 'electronics', from: ['laptops', 'mobile-accessories'] },
  { name: 'Kitchen', slug: 'kitchen', from: ['kitchen-accessories'] },
  { name: 'Groceries', slug: 'groceries', from: ['groceries'] },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors', from: ['sports-accessories'] },
  { name: 'Beauty & Personal Care', slug: 'beauty-personal-care', from: ['beauty', 'skin-care', 'fragrances'] },
  { name: "Men's Fashion", slug: 'mens-fashion', from: ['mens-shirts', 'mens-shoes', 'mens-watches'] },
  { name: "Women's Fashion", slug: 'womens-fashion', from: ['womens-dresses', 'tops', 'womens-shoes', 'womens-bags'] },
  { name: 'Watches & Accessories', slug: 'watches-accessories', from: ['womens-watches', 'womens-jewellery', 'sunglasses'] },
  { name: 'Home & Furniture', slug: 'home-furniture', from: ['furniture', 'home-decoration'] },
];

const slugify = (value) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Round-robin across the source categories so each store category is varied. */
function pickProducts(all, sources) {
  const pools = sources.map((source) => all.filter((p) => p.category === source));
  const picked = [];
  for (let i = 0; picked.length < PRODUCTS_PER_CATEGORY && pools.some((pool) => i < pool.length); i++) {
    for (const pool of pools) if (pool[i] && picked.length < PRODUCTS_PER_CATEGORY) picked.push(pool[i]);
  }
  return picked;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  const isPng = buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG';
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const type = isWebp ? 'image/webp' : isPng ? 'image/png' : isJpeg ? 'image/jpeg' : null;
  if (!type) throw new Error('not a JPEG/PNG/WebP image');
  return { buffer, type, ext: type.split('/')[1].replace('jpeg', 'jpg') };
}

// ---------------------------------------------------------------------------

async function main() {
  // --- Users -----------------------------------------------------------------
  const users = loadUsers();
  saveUsers(users); // write passwords BEFORE registering, so a failed run never loses them
  console.log(`\nUsers (${users.length})`);
  for (const user of users) {
    const r = await call('POST', `${AUTH_URL}/auth/register`, {
      json: { email: user.email, password: user.password, firstName: user.firstName, lastName: user.lastName },
    });
    if (r.status === 201 || r.status === 200) {
      user.accountId = r.body.user?.id ?? r.body.id;
      console.log(`  + ${user.email}`);
    } else if (r.status === 409) {
      console.log(`  = ${user.email} (already exists)`);
    } else {
      throw new Error(`Register failed for ${user.email}: ${describe(r)}`);
    }
  }

  const admin = users[0];
  await promoteToAdmin(admin.email);
  const adminSession = await login(admin.email, admin.password);
  if (adminSession.user.role !== 'admin') throw new Error('Admin promotion did not take effect.');
  const token = adminSession.accessToken;
  console.log(`  ✓ ${admin.email} is an admin`);

  // Account ids for anyone registered on an earlier run, then fund every wallet.
  for (const user of users) {
    if (!user.accountId) user.accountId = (await login(user.email, user.password)).user.id;
    const r = await call('POST', `${PAYMENT_URL}/wallets/${user.accountId}/seed`, {
      token,
      json: { balance: user.walletBalance, currency: 'USD' },
    });
    if (r.status >= 300) throw new Error(`Wallet seed failed for ${user.email}: ${describe(r)}`);
  }
  saveUsers(users);
  console.log(`  ✓ wallets funded — credentials saved to seed/seed-users.json`);

  // --- Categories ------------------------------------------------------------
  console.log('\nCategories (10)');
  const existing = (await call('GET', `${CATALOG_URL}/categories`)).body;
  const categoryIds = {};
  for (const category of CATEGORIES) {
    const found = existing.find((c) => c.slug === category.slug);
    if (found) {
      categoryIds[category.slug] = found.id;
      console.log(`  = ${category.name}`);
      continue;
    }
    const r = await call('POST', `${CATALOG_URL}/categories`, { token, json: { name: category.name, slug: category.slug } });
    if (r.status >= 300) throw new Error(`Category ${category.name}: ${describe(r)}`);
    categoryIds[category.slug] = r.body.id;
    console.log(`  + ${category.name}`);
  }

  // --- Products --------------------------------------------------------------
  console.log('\nProducts (100) — downloading photos from dummyjson.com');
  const all = (await (await fetch('https://dummyjson.com/products?limit=0')).json()).products;
  let created = 0;
  let skipped = 0;
  for (const category of CATEGORIES) {
    const products = pickProducts(all, category.from);
    console.log(`  ${category.name}: ${products.length}`);
    for (const p of products) {
      const images = [];
      for (const url of p.images.slice(0, MAX_IMAGES)) {
        try {
          images.push(await download(url));
        } catch (error) {
          console.warn(`    ! skipped photo ${url}: ${error.message}`);
        }
      }
      if (images.length === 0) {
        console.warn(`    ! ${p.title}: no usable photos, skipped`);
        continue;
      }

      const form = new FormData();
      form.append('categoryId', categoryIds[category.slug]);
      form.append('name', p.title);
      form.append('sku', p.sku);
      form.append('slug', slugify(p.title));
      form.append('description', p.description ?? '');
      form.append('price', p.price.toFixed(2));
      form.append('initialQuantity', String(Math.max(p.stock ?? 0, 5)));
      images.forEach((image, i) => form.append('images', new Blob([image.buffer], { type: image.type }), `${slugify(p.title)}-${i + 1}.${image.ext}`));

      const r = await call('POST', `${CATALOG_URL}/products`, { token, form });
      if (r.status === 201 || r.status === 200) {
        created++;
        console.log(`    + ${p.title} (${images.length} photo${images.length === 1 ? '' : 's'})`);
      } else if (r.status === 409) {
        skipped++;
        console.log(`    = ${p.title} (already exists)`);
      } else {
        throw new Error(`Product ${p.title}: ${describe(r)}`);
      }
    }
  }

  console.log(`\nDone: ${users.length} users, ${CATEGORIES.length} categories, ${created} products created, ${skipped} already existed.`);
  console.log(`Log in as the admin with the credentials in seed/seed-users.json.\n`);
}

main().catch((error) => {
  console.error(`\nSeed failed: ${error.message}`);
  process.exit(1);
});
