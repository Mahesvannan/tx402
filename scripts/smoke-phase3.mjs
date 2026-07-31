/**
 * Phase 3 deploy smoke test.
 *
 * Verifies the public host answers the core public routes correctly:
 *   - /health
 *   - /health?deep=1
 *   - /discovery
 *   - /explain without payment (should challenge with 402 when priced)
 *
 * Usage:
 *   TX402_URL=https://your-host node scripts/smoke-phase3.mjs [txid]
 */

const SERVER = (process.env.TX402_URL || 'http://localhost:4021').replace(/\/+$/, '');
const DEEP_NETWORK = process.env.DEEP_HEALTH_NETWORK || 'testnet';
const TXID =
  process.argv[2] || '7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function getJson(pathname) {
  const url = `${SERVER}${pathname}`;
  const res = await fetch(url);
  const text = await res.text();

  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    fail(`${pathname} returned non-JSON response (${res.status}): ${text.slice(0, 300)}`);
  }

  return { url, res, body };
}

console.log(`Smoke testing ${SERVER}`);

const health = await getJson('/health');
if (!health.res.ok) fail(`/health returned ${health.res.status}`);
if (health.body?.ok !== true) fail('/health did not report ok:true');
console.log(`PASS /health -> ${health.res.status}`);

const deep = await getJson(`/health?deep=1&network=${encodeURIComponent(DEEP_NETWORK)}`);
if (!deep.res.ok) fail(`/health?deep=1 returned ${deep.res.status}`);
if (deep.body?.checks?.indexer !== true) fail('deep health did not report indexer:true');
console.log(`PASS /health?deep=1 -> ${deep.res.status}`);

const discovery = await getJson('/discovery');
if (!discovery.res.ok) fail(`/discovery returned ${discovery.res.status}`);
if (!Array.isArray(discovery.body?.routes) || discovery.body.routes.length === 0) {
  fail('/discovery did not return any routes');
}
const explainRoute = discovery.body.routes.find((route) => route.path === '/explain');
if (!explainRoute) fail('/discovery did not describe /explain');
console.log(
  `PASS /discovery -> ${discovery.res.status} (priced=${Boolean(explainRoute.priced)}${explainRoute.price ? `, price=${explainRoute.price}` : ''})`
);

const explain = await getJson(`/explain?txid=${encodeURIComponent(TXID)}`);
if (explainRoute.priced) {
  if (explain.res.status !== 402) {
    fail(`/explain should challenge with 402 in priced mode, got ${explain.res.status}`);
  }
  console.log('PASS /explain unpaid challenge -> 402');
} else {
  if (explain.res.status >= 500) {
    fail(`/explain returned server error ${explain.res.status} in free mode`);
  }
  console.log(`PASS /explain free-mode probe -> ${explain.res.status}`);
}

console.log('Smoke test complete.');
