/**
 * Regression tests for the startup config guards in src/payments.js
 * (the H1 wrong-network-asset guard, M3's PAY_TO validation, and R5's
 * USDC_ASSET_ID integer validation).
 *
 * These guards run as top-level module code at import time, so each test
 * re-imports payments.js fresh (bypassing Node's ESM module cache via a
 * unique query string per import) with a controlled env. Deliberately does
 * NOT call buildPaymentGate() — that constructs an x402ResourceServer whose
 * middleware defaults to syncing with the live facilitator over the network
 * on first use, which would make this suite slow/network-dependent for no
 * benefit: everything these tests care about is decided before
 * buildPaymentGate is ever called.
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

// Every env var payments.js reads. All of them get explicitly set (even to
// '') before each import so dotenv.config() -- which only fills in keys NOT
// already present in process.env -- can never leak a real local .env file's
// values into these tests, regardless of what's on the developer's machine.
const MANAGED_KEYS = [
  'NETWORK', 'USDC_ASSET_ID', 'PAY_TO', 'FACILITATOR_URL',
  'EXPLAIN_PRICE_USD', 'GROUP_PRICE_USD', 'BATCH_PRICE_USD', 'ACCOUNT_PRICE_USD',
];

async function importWithEnv(envVars) {
  const saved = {};
  for (const k of MANAGED_KEYS) saved[k] = process.env[k];
  for (const k of MANAGED_KEYS) process.env[k] = envVars[k] ?? '';
  try {
    return await import(`../src/payments.js?test=${Date.now()}-${Math.random()}`);
  } finally {
    for (const k of MANAGED_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

async function assertThrowsOnImport(envVars, matcher) {
  let threw = null;
  try {
    await importWithEnv(envVars);
  } catch (e) {
    threw = e;
  }
  assert.ok(threw, 'expected the import to throw, but it did not');
  assert.ok(
    matcher.test(threw.message),
    `error message didn't match ${matcher}. Got: ${threw.message}`
  );
}

const TESTNET_CAIP2 = 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=';
const MAINNET_CAIP2 = 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=';
// A real, well-formed Testnet address used elsewhere in this project. These
// tests only need it to be a VALID address shape -- no network call or fund
// movement happens here.
const VALID_ADDR = 'P76ONMOUXWUQHKCJCUMHHJKJVYAJXLPS6S5QXYGFCLMAAEMBYXHY347ZBE';

console.log('\npayments.js — free-mode default (no PAY_TO)');

await test('paymentsConfigured is false when PAY_TO is unset', async () => {
  const m = await importWithEnv({});
  assert.strictEqual(m.paymentsConfigured, false);
});

console.log('\npayments.js — network-derived USDC default (H1)');

await test('defaults to testnet when NETWORK is unset', async () => {
  const m = await importWithEnv({});
  assert.strictEqual(m.resolvedNetwork, 'testnet');
});

await test('resolves mainnet when NETWORK points at the mainnet CAIP-2 id', async () => {
  const m = await importWithEnv({ NETWORK: MAINNET_CAIP2, PAY_TO: VALID_ADDR });
  assert.strictEqual(m.resolvedNetwork, 'mainnet');
});

await test('resolves testnet when NETWORK explicitly points at the testnet CAIP-2 id', async () => {
  const m = await importWithEnv({ NETWORK: TESTNET_CAIP2, PAY_TO: VALID_ADDR });
  assert.strictEqual(m.resolvedNetwork, 'testnet');
});

console.log('\npayments.js — stale wrong-network USDC_ASSET_ID guard (H1 regression)');

await test('throws when NETWORK=mainnet but USDC_ASSET_ID is the testnet id', async () => {
  await assertThrowsOnImport(
    { NETWORK: MAINNET_CAIP2, USDC_ASSET_ID: '10458941', PAY_TO: VALID_ADDR },
    /Testnet.*USDC asset id.*NETWORK is set to mainnet/s
  );
});

await test('throws when NETWORK=testnet but USDC_ASSET_ID is the mainnet id', async () => {
  await assertThrowsOnImport(
    { USDC_ASSET_ID: '31566704', PAY_TO: VALID_ADDR },
    /Mainnet.*USDC asset id.*NETWORK is set to testnet/s
  );
});

await test('does not throw for a correctly-matching explicit USDC_ASSET_ID', async () => {
  const m = await importWithEnv({ USDC_ASSET_ID: '10458941', PAY_TO: VALID_ADDR });
  assert.strictEqual(m.paymentsConfigured, true);
});

console.log('\npayments.js — USDC_ASSET_ID must be a positive integer (R5 regression)');

await test('throws for a non-numeric USDC_ASSET_ID', async () => {
  await assertThrowsOnImport({ USDC_ASSET_ID: 'not-a-number', PAY_TO: VALID_ADDR }, /not a positive integer/);
});

await test('throws for a negative USDC_ASSET_ID', async () => {
  await assertThrowsOnImport({ USDC_ASSET_ID: '-5', PAY_TO: VALID_ADDR }, /not a positive integer/);
});

await test('throws for a zero USDC_ASSET_ID', async () => {
  await assertThrowsOnImport({ USDC_ASSET_ID: '0', PAY_TO: VALID_ADDR }, /not a positive integer/);
});

console.log('\npayments.js — PAY_TO validation (M3 regression)');

await test('throws for a malformed PAY_TO', async () => {
  await assertThrowsOnImport({ PAY_TO: 'not-a-real-address' }, /is not a valid Algorand address/);
});

await test('accepts a well-formed PAY_TO', async () => {
  const m = await importWithEnv({ PAY_TO: VALID_ADDR });
  assert.strictEqual(m.paymentsConfigured, true);
});

console.log('\npayments.js — price default');

await test('defaults explainPrice to $0.005', async () => {
  const m = await importWithEnv({});
  assert.strictEqual(m.explainPrice, '$0.005');
  assert.strictEqual(m.groupPrice, '$0.01');
  assert.strictEqual(m.batchPrice, '$0.02');
  assert.strictEqual(m.accountPrice, '$0.01');
});

await test('respects an explicit EXPLAIN_PRICE_USD', async () => {
  const m = await importWithEnv({ EXPLAIN_PRICE_USD: '$0.02' });
  assert.strictEqual(m.explainPrice, '$0.02');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
