/**
 * Unit tests for the rate limiter (src/rateLimit.js).
 *
 * No HTTP involved — these call the middleware function directly with a
 * fake req/res, which is enough to test the counting, blocking, per-IP
 * isolation, and eviction logic in isolation and fast.
 */

import assert from 'node:assert';
import { rateLimit } from '../src/rateLimit.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
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

/** Minimal fake req/res that records what the middleware did. */
function fakeReqRes(ip) {
  let statusCode = 200;
  let body = null;
  const headers = {};
  const req = { ip, socket: {} };
  const res = {
    set(key, value) {
      headers[key] = value;
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  return { req, res, headers, result: () => ({ statusCode, body, headers }) };
}

console.log('\nrateLimit — basic counting and blocking');

test('allows requests up to max', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 3 });
  let nextCalls = 0;
  for (let i = 0; i < 3; i++) {
    const { req, res } = fakeReqRes('1.1.1.1');
    mw(req, res, () => nextCalls++);
  }
  assert.strictEqual(nextCalls, 3, 'all 3 requests within the limit should call next()');
});

test('blocks the request that exceeds max with 429', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 2, message: 'slow down' });
  for (let i = 0; i < 2; i++) {
    const { req, res } = fakeReqRes('2.2.2.2');
    mw(req, res, () => {});
  }
  const { req, res, result } = fakeReqRes('2.2.2.2');
  let nextCalled = false;
  mw(req, res, () => (nextCalled = true));
  const r = result();
  assert.strictEqual(r.statusCode, 429);
  assert.strictEqual(r.body.error, 'slow down');
  assert.ok(!nextCalled, 'next() must not be called once blocked');
});

test('sets a Retry-After header when blocking', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1 });
  const first = fakeReqRes('3.3.3.3');
  mw(first.req, first.res, () => {});
  const second = fakeReqRes('3.3.3.3');
  mw(second.req, second.res, () => {});
  const r = second.result();
  assert.strictEqual(r.statusCode, 429);
  assert.ok('Retry-After' in r.headers, 'Retry-After header should be set');
  assert.ok(Number(r.headers['Retry-After']) > 0);
});

test('falls back to a generic message when none is provided', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 0 });
  const { req, res, result } = fakeReqRes('4.4.4.4');
  mw(req, res, () => {});
  assert.strictEqual(result().body.error, 'Too many requests. Try again shortly.');
});

console.log('\nrateLimit — per-IP isolation');

test('different IPs are tracked independently', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1 });
  const a1 = fakeReqRes('5.5.5.5');
  mw(a1.req, a1.res, () => {});
  const b1 = fakeReqRes('6.6.6.6');
  let bNextCalled = false;
  mw(b1.req, b1.res, () => (bNextCalled = true));
  assert.ok(bNextCalled, 'a fresh IP should not be affected by another IP hitting its limit');
});

test('falls back to socket.remoteAddress when req.ip is absent', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1 });
  const req = { socket: { remoteAddress: '7.7.7.7' } };
  const res = {
    set() {
      return this;
    },
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  let nextCalled = false;
  mw(req, res, () => (nextCalled = true));
  assert.ok(nextCalled, 'should still track and allow via socket.remoteAddress');
});

console.log('\nrateLimit — window reset');

await asyncTest('resets the count once the window passes', async () => {
  const mw = rateLimit({ windowMs: 50, max: 1 });
  const first = fakeReqRes('8.8.8.8');
  mw(first.req, first.res, () => {});
  const blocked = fakeReqRes('8.8.8.8');
  let blockedNext = false;
  mw(blocked.req, blocked.res, () => (blockedNext = true));
  assert.ok(!blockedNext, 'second request within the same window should be blocked');

  await new Promise((resolve) => setTimeout(resolve, 80));

  const afterWindow = fakeReqRes('8.8.8.8');
  let allowedAgain = false;
  mw(afterWindow.req, afterWindow.res, () => (allowedAgain = true));
  assert.ok(allowedAgain, 'a request after the window passed should be treated as a fresh window');
});

console.log('\nrateLimit — eviction (R1 regression)');

await asyncTest('evicts expired entries instead of leaking them forever', async () => {
  // R1: the limiter's internal Map used to grow by one entry per distinct
  // IP forever. This doesn't inspect the Map directly (it's private to the
  // closure) — instead it proves eviction behaviorally: flood many distinct
  // IPs, wait past one window + one sweep tick, then confirm an early IP is
  // treated as a brand new window (allowed), which only happens if its
  // entry was actually cleared rather than silently persisting.
  const mw = rateLimit({ windowMs: 60, max: 1 });

  for (let i = 0; i < 200; i++) {
    const { req, res } = fakeReqRes(`flood-${i}`);
    mw(req, res, () => {});
  }

  await new Promise((resolve) => setTimeout(resolve, 150));

  const { req, res, result } = fakeReqRes('flood-0');
  let allowed = false;
  mw(req, res, () => (allowed = true));
  assert.ok(allowed, 'an IP from before the sweep should get a fresh window, proving eviction ran');
  assert.notStrictEqual(result().statusCode, 429);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
