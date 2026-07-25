/**
 * tx402 — plain-English explanations of Algorand transactions.
 *
 * PHASE 2: /explain is now gated by x402 pay-per-call middleware, settled
 * on Algorand Testnet through the hosted GoPlausible facilitator. It only
 * activates once PAY_TO is set in the environment — see src/payments.js.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { fetchTransaction, fetchAsset, checkIndexerHealth, HttpError } from './indexer.js';
import { decodeTransaction } from './decoder.js';
import { narrate } from './narrator.js';
import {
  buildPaymentGate,
  paymentsConfigured,
  explainPrice,
  resolvedNetwork,
  checkFacilitatorHealth,
} from './payments.js';
import { rateLimit } from './rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version: APP_VERSION } = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

const app = express();
const PORT = process.env.PORT || 4021;

// Trusting X-Forwarded-For is only safe when a proxy you control is
// guaranteed to overwrite whatever a client sends — otherwise a client can
// set that header itself and get a fresh req.ip on every request, which
// fully defeats per-IP rate limiting (verified: rotating the header let a
// client blow through the /explain rate limit entirely). Default OFF; only
// enable this once you've actually deployed behind such a proxy (Vercel,
// Railway, etc.) and confirmed it strips/overwrites inbound XFF.
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(express.json({ limit: '8kb' }));

// Minimal access log — method, path, status, latency, client IP. Enough for
// production debugging and abuse investigation without pulling in a full
// logging framework for a service this size. Runs first so every request
// is logged, including ones later rejected by validation or rate limiting.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms ${req.ip}`);
  });
  next();
});

// A valid Algorand transaction ID is exactly 52 base32 characters.
const TXID_PATTERN = /^[A-Z2-7]{52}$/;

// req.query values aren't always strings — repeated query keys (?txid=a&txid=b)
// produce an array, and bracket-style keys (?txid[x]=y) produce an object.
// Calling .trim() on either throws, which (with no global error handler)
// used to crash to Express's default handler and leak a full stack trace
// with absolute file paths straight into the response body. Verified live.
function getQueryString(req, key) {
  const raw = req.query[key];
  return typeof raw === 'string' ? raw : null;
}

// /explain proxies to the public Algorand indexer on every call. In free
// mode (no PAY_TO configured) there is no payment gate to throttle abuse,
// so this is the only thing standing between the service and someone using
// it as a free, unbounded indexer proxy. Kept intentionally strict when
// unpaid; generous but still present when paid, as defense-in-depth against
// a buggy or malicious paying client hammering the upstream indexer.
const explainLimiter = paymentsConfigured
  ? rateLimit({ windowMs: 60_000, max: 60, message: 'Rate limit exceeded. Try again shortly.' })
  : rateLimit({
      windowMs: 60_000,
      max: 10,
      message:
        '/explain is running in free (unpaid) mode and is rate-limited to 10 requests/minute ' +
        'per IP. Configure PAY_TO to enable paid access without this cap.',
    });
app.use('/explain', explainLimiter);

// Validate the request shape BEFORE the payment gate. The gate can't know
// anything about our route's business rules — without this, a client would
// have to pay for a request that was always going to 400 (missing/malformed
// txid), since the gate demands payment for anything matching "GET /explain"
// regardless of query params.
app.use('/explain', (req, res, next) => {
  const txid = (getQueryString(req, 'txid') || '').trim().toUpperCase();
  if (!txid) {
    return res.status(400).json({ error: 'Missing required query parameter: txid' });
  }
  if (!TXID_PATTERN.test(txid)) {
    return res.status(400).json({
      error: 'Invalid txid: expected 52 base32 characters (A-Z, 2-7).',
    });
  }
  next();
});

const discoveryLimiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use('/discovery', discoveryLimiter);

// F1: /health?deep=1 pings external services (indexer, facilitator) and — unlike
// plain /health — must not be reachable at unlimited rate, or it becomes a free
// amplifier against those services (the same "unauthenticated unbounded proxy"
// class H2 fixed for /explain, just on a new route). Two layers, both needed:
// a small per-IP limiter bounds request volume, and the cache below bounds
// actual upstream calls to at most one per network per TTL window regardless
// of how many requests arrive — so even a burst that slips under the per-IP
// cap can't multiply into repeated outbound pings.
const deepHealthLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  message: 'Too many deep health checks. Try again shortly.',
});

const DEEP_HEALTH_TTL_MS = 15_000;
const deepHealthCache = new Map(); // network -> { result, expiresAt }
const deepHealthInFlight = new Map(); // network -> Promise<result>, dedupes concurrent misses

async function getDeepHealth(network) {
  const cached = deepHealthCache.get(network);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const inFlight = deepHealthInFlight.get(network);
  if (inFlight) return inFlight;

  // This promise must NEVER reject, and must ALWAYS clear its in-flight slot.
  // checkIndexerHealth/checkFacilitatorHealth are contractually non-throwing,
  // but relying on that would make the whole route fragile: a future edit that
  // let either throw would (a) leave a rejected promise stuck in the in-flight
  // map forever — poisoning every later check for this network — and (b) reach
  // the route's un-try/caught `await`, which Express 4 does not rescue, hanging
  // the request. try/catch → safe default, finally → guaranteed cleanup makes
  // that structurally impossible regardless of what the check functions do.
  const promise = (async () => {
    try {
      const [indexerOk, facilitatorOk] = await Promise.all([
        checkIndexerHealth(network),
        paymentsConfigured ? checkFacilitatorHealth() : Promise.resolve(true),
      ]);
      const result = { indexerOk, facilitatorOk };
      // Only cache a result we actually computed — never cache a failure.
      deepHealthCache.set(network, { result, expiresAt: Date.now() + DEEP_HEALTH_TTL_MS });
      return result;
    } catch {
      // A check unexpectedly threw: report not-ready this once (uncached, so the
      // next request retries) rather than rejecting and hanging the handler.
      return { indexerOk: false, facilitatorOk: false };
    } finally {
      deepHealthInFlight.delete(network);
    }
  })();
  deepHealthInFlight.set(network, promise);
  return promise;
}

const paymentGate = buildPaymentGate();
if (paymentGate) {
  app.use(paymentGate);
  console.log(`x402 payments ENABLED for /explain (${explainPrice} per call, ${resolvedNetwork})`);
} else {
  console.warn(
    'x402 PAY_TO not set in .env — /explain is running FREE (Phase 1 fallback). ' +
      'Set PAY_TO to a Testnet address opted in to Testnet USDC to enable Phase 2 payments.'
  );
}

/**
 * Free forever: lets agents/load-balancers check liveness without paying.
 *
 * Plain `/health` is a LIVENESS check only — it answers "is the process up",
 * not "can it actually serve /explain" (D3). `?deep=1` adds a READINESS
 * check: a short-timeout ping of the two external services /explain depends
 * on (the Algorand indexer, and — only when payments are configured — the
 * x402 facilitator). Kept opt-in and off the default path so routine
 * load-balancer polling stays fast and never itself hammers those services.
 * The deep path alone is rate-limited and result-cached (see deepHealthLimiter
 * / getDeepHealth above) — plain `/health` stays intentionally unlimited.
 */
app.get(
  '/health',
  (req, res, next) => {
    if (req.query.deep !== '1') {
      return res.json({ ok: true, service: 'tx402', version: APP_VERSION });
    }
    next();
  },
  deepHealthLimiter,
  async (req, res) => {
    const network = (getQueryString(req, 'network') || 'mainnet').trim();
    if (network !== 'mainnet' && network !== 'testnet') {
      return res.status(400).json({
        error: 'Unknown network for deep health check. Use "mainnet" or "testnet".',
      });
    }

    const { indexerOk, facilitatorOk } = await getDeepHealth(network);
    const ok = indexerOk && facilitatorOk;

    res.status(ok ? 200 : 503).json({
      ok,
      service: 'tx402',
      version: APP_VERSION,
      checks: {
        indexer: indexerOk,
        facilitator: paymentsConfigured ? facilitatorOk : 'not configured',
      },
    });
  }
);

/**
 * Free forever: machine-readable description of what this service sells.
 * Agents read this to decide whether to pay for /explain.
 */
app.get('/discovery', (_req, res) => {
  res.json({
    service: 'tx402',
    summary:
      'Explains any Algorand transaction in plain English. Give it a transaction ID, ' +
      'get back a one-sentence human-readable summary plus normalised structured fields ' +
      '(type, sender, receiver, amount with correct decimals, asset name, fee, timestamp, decoded note).',
    routes: [
      {
        path: '/explain',
        method: 'GET',
        params: {
          txid: 'required — Algorand transaction ID',
          network: 'optional — "mainnet" (default) or "testnet"',
        },
        priced: paymentsConfigured,
        price: paymentsConfigured ? explainPrice : null,
        paymentProtocol: paymentsConfigured ? 'x402' : null,
      },
    ],
    deterministic: true,
    llmInServingPath: false,
  });
});

app.get('/explain', async (req, res) => {
  // txid presence/format already validated upstream, before the payment gate.
  const txid = getQueryString(req, 'txid').trim().toUpperCase();
  const network = (getQueryString(req, 'network') || 'mainnet').trim();

  try {
    const raw = await fetchTransaction(txid, network);

    // Only asset transfers need a metadata lookup; everything else is pure CPU.
    let asset = null;
    if (raw['tx-type'] === 'axfer') {
      const assetId = raw['asset-transfer-transaction']?.['asset-id'];
      asset = await fetchAsset(assetId, network);
    }

    const decoded = decodeTransaction(raw, { asset });
    const summary = narrate(decoded);

    res.json({
      txid: decoded.txid,
      network,
      summary,
      details: decoded,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Internal error while explaining transaction.' });
  }
});

// Global fallback error handler — MUST be registered last (Express only
// treats a 4-arg middleware as an error handler). Catches anything that
// throws synchronously in middleware/routes before it reaches the /explain
// handler's own try/catch (e.g. a bug in a route defined above). Without
// this, Express's default handler renders the full stack trace, including
// absolute file paths, straight into the response body.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const server = app.listen(PORT, () => {
  console.log(`tx402 listening on http://localhost:${PORT}`);
  console.log(`  try: http://localhost:${PORT}/explain?txid=YOUR_TXID`);
});

// Production hosts (Docker, Railway, Fly, etc.) send SIGTERM on deploy or
// restart and expect the process to stop accepting new connections and
// drain in-flight requests before exiting, rather than being killed
// mid-request. server.close() does exactly that — it stops the listener
// but lets active requests finish.
function shutdown(signal) {
  console.log(`${signal} received, closing server...`);
  server.close((err) => {
    if (err) {
      console.error('Error while closing server:', err);
      process.exit(1);
    }
    console.log('Server closed.');
    process.exit(0);
  });
  // Force-exit if something (a stuck connection, a hung request) prevents
  // close() from ever calling back, so a deploy can't hang indefinitely.
  setTimeout(() => {
    console.error('Graceful shutdown timed out after 10s, forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Exported for tests — lets a test suite import the wired-up app, drive
// real requests against `server`'s address, and close it deterministically
// afterward, instead of every test spawning its own `npm start` process.
export { app, server };
