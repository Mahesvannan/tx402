/**
 * tx402 — plain-English explanations of Algorand transactions.
 *
 * PHASE 2: /explain is now gated by x402 pay-per-call middleware, settled
 * on Algorand Testnet through the hosted GoPlausible facilitator. It only
 * activates once PAY_TO is set in the environment — see src/payments.js.
 */

import express from 'express';
import helmet from 'helmet';
import { fetchTransaction, fetchAsset, HttpError } from './indexer.js';
import { decodeTransaction } from './decoder.js';
import { narrate } from './narrator.js';
import { buildPaymentGate, paymentsConfigured, explainPrice, resolvedNetwork } from './payments.js';
import { rateLimit } from './rateLimit.js';

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

/** Free forever: lets agents check liveness without paying. */
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tx402', version: '0.1.0' });
});

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

app.listen(PORT, () => {
  console.log(`tx402 listening on http://localhost:${PORT}`);
  console.log(`  try: http://localhost:${PORT}/explain?txid=YOUR_TXID`);
});
