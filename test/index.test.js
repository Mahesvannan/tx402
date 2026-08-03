/**
 * HTTP integration tests for src/index.js in FREE mode — the
 * request-handling layer itself, not just the pure decoder/narrator
 * functions.
 *
 * These exist specifically because H2 (rate limiting), R2 (rate-limit
 * bypass via X-Forwarded-For), and R3 (crash + stack-trace leak on
 * malformed input) were all found by making real HTTP requests against a
 * running server — none of them were visible from the pure-function unit
 * tests. This suite makes those same requests so a future refactor can't
 * silently reintroduce any of them.
 *
 * Paid-mode HTTP behavior (the payment-gate-ordering bonus bug) is covered
 * separately in test/index.paid.test.js, in its own process: src/index.js
 * imports src/payments.js via a plain (non-cache-busted) specifier, so once
 * payments.js has evaluated once with a given env inside a process, Node's
 * module cache pins that config for every later re-import of index.js in
 * that same process -- fine in production (index.js is only ever imported
 * once), but it means free-mode and paid-mode server instances can't both
 * be exercised via repeated dynamic import() within a single test process.
 *
 * Each test group imports src/index.js fresh (unique cache-busting query
 * string + a dedicated port) with a controlled env, the same pattern used
 * in payments.test.js, so these tests are independent of whatever is in a
 * developer's local .env and don't collide with a real `npm start`.
 */

import assert from 'node:assert';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

const MANAGED_KEYS = [
  'PORT',
  'NETWORK',
  'USDC_ASSET_ID',
  'PAY_TO',
  'FACILITATOR_URL',
  'EXPLAIN_PRICE_USD',
  'GROUP_PRICE_USD',
  'BATCH_PRICE_USD',
  'ACCOUNT_PRICE_USD',
  'TRUST_PROXY',
  'PUBLIC_BASE_URL',
];

let nextPort = 4500; // distinct from the real dev port (4021) and from each other per group

async function waitForServer(baseUrl, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server at ${baseUrl} never became ready`);
}

async function startServer(envVars) {
  const saved = {};
  for (const k of MANAGED_KEYS) saved[k] = process.env[k];
  for (const k of MANAGED_KEYS) process.env[k] = envVars[k] ?? '';

  const port = nextPort++;
  process.env.PORT = String(port); // overrides the '' set above on purpose

  const mod = await import(`../src/index.js?test=${Date.now()}-${Math.random()}`);

  for (const k of MANAGED_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl);
  return { ...mod, baseUrl };
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

const WELL_FORMED_TXID = 'Z'.repeat(52); // valid FORMAT, never a real transaction

// ---------------------------------------------------------------------------

console.log('\nindex.js (free mode) — basic endpoints & hardening');
{
  const { server, baseUrl } = await startServer({});

  await test('/health returns 200 with the package.json version (P6)', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.ok, true);
    assert.ok(body.version, 'version should be present');
  });

  await test('/health?deep=1 reports readiness of external deps (D3), facilitator not configured in free mode', async () => {
    const res = await fetch(`${baseUrl}/health?deep=1`);
    const body = await res.json();
    assert.ok(res.status === 200 || res.status === 503, 'deep health must be 200 or 503, never a crash');
    assert.strictEqual(typeof body.checks.indexer, 'boolean');
    assert.strictEqual(body.checks.facilitator, 'not configured');
  });

  await test('/discovery reports priced:false in free mode', async () => {
    const res = await fetch(`${baseUrl}/discovery`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.routes[0].priced, false);
    assert.strictEqual(body.routes[0].price, null);
  });

  await test('/openapi.json returns the OpenAPI document', async () => {
    const res = await fetch(`${baseUrl}/openapi.json`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.openapi, '3.1.0');
    assert.ok(body.paths['/explain'], 'OpenAPI spec should document /explain');
    assert.ok(body.paths['/demo'], 'OpenAPI spec should document /demo');
    assert.ok(body.paths['/group'], 'OpenAPI spec should document /group');
    assert.ok(body.paths['/batch'], 'OpenAPI spec should document /batch');
    assert.ok(body.paths['/account/activity'], 'OpenAPI spec should document account activity');
    assert.ok(body.paths['/analytics'], 'OpenAPI spec should document analytics');
  });

  await test('/demo returns a free allowlisted Mainnet explanation', async () => {
    const res = await fetch(`${baseUrl}/demo?example=algo`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.demo, true);
    assert.strictEqual(body.example, 'algo');
    assert.strictEqual(body.network, 'mainnet');
    assert.ok(body.summary);
    assert.ok(body.details);
  });

  await test('/demo rejects transactions outside its allowlist', async () => {
    const res = await fetch(`${baseUrl}/demo?example=arbitrary`);
    assert.strictEqual(res.status, 400);
  });

  await test('/analytics exposes aggregate privacy-safe adoption counters', async () => {
    const res = await fetch(`${baseUrl}/analytics`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.service, 'tx402');
    assert.strictEqual(body.privacy.storesIpAddresses, false);
    assert.strictEqual(body.privacy.storesWalletAddresses, false);
    assert.ok(body.funnel.demoCalls >= 2);
  });

  await test('/.well-known/agent.json returns agent marketplace metadata', async () => {
    const res = await fetch(`${baseUrl}/.well-known/agent.json`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.name, 'tx402');
    assert.ok(body.skills[0].tags.includes('x402'));
    assert.ok(body.x402.openapi.endsWith('/openapi.json'));
  });

  await test('/.well-known/x402 returns resource manifest', async () => {
    const res = await fetch(`${baseUrl}/.well-known/x402`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.name, 'tx402');
    assert.ok(body.resources.includes('https://tx402-production.up.railway.app/explain'));
  });

  await test('/llms.txt returns agent-readable documentation', async () => {
    const res = await fetch(`${baseUrl}/llms.txt`);
    const body = await res.text();
    assert.strictEqual(res.status, 200);
    assert.ok(body.includes('# tx402'));
    assert.ok(body.includes('/.well-known/agent.json'));
  });

  await test('/ serves a landing page with metadata links', async () => {
    const res = await fetch(`${baseUrl}/`);
    const body = await res.text();
    assert.strictEqual(res.status, 200);
    assert.ok(body.includes('tx402'));
    assert.ok(body.includes('/.well-known/x402'));
    assert.ok(body.includes('Try it free'));
    assert.ok(body.includes('/demo.js'));
  });

  await test('helmet security headers are present (L7)', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.ok(res.headers.get('x-content-type-options'), 'X-Content-Type-Options missing');
    assert.ok(res.headers.get('content-security-policy'), 'Content-Security-Policy missing');
  });

  await test('missing txid returns 400', async () => {
    const res = await fetch(`${baseUrl}/explain`);
    assert.strictEqual(res.status, 400);
  });

  await test('malformed (array) txid returns a clean 400, not a stack-trace 500 (R3)', async () => {
    const res = await fetch(`${baseUrl}/explain?txid=AAAA&txid=BBBB`);
    const text = await res.text();
    assert.strictEqual(res.status, 400);
    assert.ok(!text.includes('at file://'), 'response must not leak a stack trace');
    assert.ok(!text.includes('node_modules'), 'response must not leak filesystem paths');
  });

  await test('malformed (object) txid returns a clean 400, not a stack-trace 500 (R3)', async () => {
    const res = await fetch(`${baseUrl}/explain?txid[x]=y`);
    const text = await res.text();
    assert.strictEqual(res.status, 400);
    assert.ok(!text.includes('at file://'), 'response must not leak a stack trace');
  });

  await test('too-short txid returns 400', async () => {
    const res = await fetch(`${baseUrl}/explain?txid=ABC`);
    assert.strictEqual(res.status, 400);
  });

  await closeServer(server);
}

// ---------------------------------------------------------------------------

console.log('\nindex.js (free mode) — rate limiting (H2) and X-Forwarded-For bypass (R2 regression)');
{
  // Fresh server = fresh rate-limiter state, TRUST_PROXY left unset.
  const { server, baseUrl } = await startServer({});

  await test('spoofed X-Forwarded-For does not bypass the per-IP limit', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      const res = await fetch(`${baseUrl}/explain?txid=${WELL_FORMED_TXID}`, {
        headers: { 'X-Forwarded-For': `10.0.0.${i}` }, // a different claimed IP every request
      });
      statuses.push(res.status);
    }
    const rateLimited = statuses.filter((s) => s === 429).length;
    assert.ok(
      rateLimited > 0,
      `expected at least one 429 among ${JSON.stringify(statuses)} — ` +
        'if none appear, spoofing bypassed the limit (R2 regressed)'
    );
  });

  await closeServer(server);
}

// ---------------------------------------------------------------------------

console.log('\nindex.js (free mode) — /health?deep=1 is not an unlimited outbound amplifier (F1 regression)');
{
  const { server, baseUrl } = await startServer({});

  await test('an unknown network for the deep check returns a clean 400, not a false "outage"', async () => {
    const res = await fetch(`${baseUrl}/health?deep=1&network=bogusnet`);
    const body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(body.error);
  });

  await test('a repeated deep check within the TTL window is served from cache, not a fresh upstream ping', async () => {
    const t0 = Date.now();
    await fetch(`${baseUrl}/health?deep=1`);
    const firstMs = Date.now() - t0;

    const t1 = Date.now();
    await fetch(`${baseUrl}/health?deep=1`);
    const secondMs = Date.now() - t1;

    assert.ok(
      secondMs < firstMs,
      `expected the cached repeat (${secondMs}ms) to be faster than the first real check ` +
        `(${firstMs}ms) — if not, every request is re-pinging upstream (F1 regressed)`
    );
  });

  await test('plain /health stays unlimited even after many deep requests hit the limiter', async () => {
    // Exhaust the deep-health limiter (max 20/min) first...
    for (let i = 0; i < 21; i++) {
      await fetch(`${baseUrl}/health?deep=1`);
    }
    // ...then confirm plain /health (no `deep`) is untouched by that limiter.
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
  });

  await test('a burst past the deep-health limiter gets 429s, not unlimited outbound pings', async () => {
    const statuses = [];
    for (let i = 0; i < 25; i++) {
      const res = await fetch(`${baseUrl}/health?deep=1`);
      statuses.push(res.status);
    }
    const rateLimited = statuses.filter((s) => s === 429).length;
    assert.ok(
      rateLimited > 0,
      `expected at least one 429 among ${JSON.stringify(statuses)} — ` +
        'if none appear, /health?deep=1 has no rate limit (F1 regressed)'
    );
  });

  await closeServer(server);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
