/**
 * HTTP integration tests for src/index.js in PAID mode.
 *
 * Split into its own process/file (rather than folded into index.test.js)
 * because src/index.js imports src/payments.js via a plain specifier with
 * no cache-busting query string -- correct for production (index.js is
 * only ever imported once per process) but it means the FIRST payments.js
 * config to load inside a process is the only one that will ever apply to
 * index.js there, no matter what env a later dynamic import() uses. Free
 * mode and paid mode therefore need separate processes to get genuinely
 * independent server instances.
 *
 * This needs a real PAY_TO and touches the live facilitator (payment
 * middleware syncs with it in the background) -- a genuine integration
 * test, not an offline unit test, consistent with how every paid-mode
 * behavior in this project has been verified throughout (see Review.md).
 * It only checks pre-payment behavior (400s and the 402 challenge shape),
 * so it never needs a funded wallet or signs anything.
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
  'TRUST_PROXY',
  'PUBLIC_BASE_URL',
];

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

  const port = 4600;
  process.env.PORT = String(port);

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

const VALID_ADDR = 'P76ONMOUXWUQHKCJCUMHHJKJVYAJXLPS6S5QXYGFCLMAAEMBYXHY347ZBE';
const WELL_FORMED_TXID = 'Z'.repeat(52); // valid FORMAT, never a real transaction

console.log('\nindex.js (paid mode) — validation runs before the payment gate (bonus-bug regression)');

const { server, baseUrl } = await startServer({ PAY_TO: VALID_ADDR });

await test('missing txid returns 400, not 402 — never charge for a request that always fails', async () => {
  const res = await fetch(`${baseUrl}/explain`);
  assert.strictEqual(res.status, 400);
});

await test('malformed txid returns 400, not 402', async () => {
  const res = await fetch(`${baseUrl}/explain?txid=AAAA&txid=BBBB`);
  assert.strictEqual(res.status, 400);
});

await test('invalid network returns 400 before the payment gate', async () => {
  const res = await fetch(`${baseUrl}/explain?txid=${WELL_FORMED_TXID}&network=bogus`);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.headers.get('payment-required'), null);
});

await test('a well-formed txid correctly reaches the payment gate (402)', async () => {
  const res = await fetch(`${baseUrl}/explain?txid=${WELL_FORMED_TXID}`);
  assert.strictEqual(res.status, 402);
  const header = res.headers.get('payment-required');
  assert.ok(header, 'PAYMENT-REQUIRED header should be present');
  const challenge = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  assert.strictEqual(challenge.resource.description.includes('Plain-English'), true);
  assert.strictEqual(challenge.resource.mimeType, 'application/json');
  assert.strictEqual(challenge.resource.serviceName, 'tx402');
  assert.ok(challenge.resource.tags.includes('algorand'));
  assert.ok(challenge.extensions?.bazaar, 'Bazaar discovery extension should be present');
  assert.strictEqual(
    challenge.extensions.bazaar.info.input.queryParams.txid,
    'YRSG7IKDPCK4XMKFFTFFFYMIHF6SJOMHUOIE4FFUWNLEQ4WG2ZOQ'
  );
});

await test('/demo stays free when payments are configured', async () => {
  const res = await fetch(`${baseUrl}/demo?example=algo`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('payment-required'), null);
});

await test('/health?deep=1 checks the facilitator too when payments are configured (D3)', async () => {
  const res = await fetch(`${baseUrl}/health?deep=1`);
  const body = await res.json();
  assert.ok(res.status === 200 || res.status === 503, 'deep health must be 200 or 503, never a crash');
  assert.strictEqual(typeof body.checks.indexer, 'boolean');
  assert.strictEqual(typeof body.checks.facilitator, 'boolean');
});

await test('/discovery reports priced:true in paid mode', async () => {
  const res = await fetch(`${baseUrl}/discovery`);
  const body = await res.json();
  assert.strictEqual(body.routes[0].priced, true);
  assert.ok(body.routes[0].price);
});

await closeServer(server);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
