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
import { isValidAlgorandAddress } from '@x402/avm';
import { checkIndexerHealth, HttpError } from './indexer.js';
import {
  explainAccountActivity,
  explainAtomicGroup,
  explainBatch,
  explainTransaction,
} from './explainer.js';
import { analyticsMiddleware, analyticsSnapshot } from './analytics.js';
import {
  buildPaymentGate,
  paymentsConfigured,
  explainPrice,
  groupPrice,
  batchPrice,
  accountPrice,
  resolvedNetwork,
  paymentNetwork,
  usdcAssetId,
  payTo,
  facilitatorUrl,
  checkFacilitatorHealth,
} from './payments.js';
import { rateLimit } from './rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version: APP_VERSION } = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);
const OPENAPI_SPEC = JSON.parse(readFileSync(path.join(__dirname, '..', 'openapi.json'), 'utf8'));

const app = express();
const PORT = process.env.PORT || 4021;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://tx402-production.up.railway.app').replace(/\/+$/, '');
const PROJECT_NAME = 'tx402';
const PROJECT_SUMMARY =
  'Plain-English Algorand transaction explanations, paid per call by AI agents using x402.';
const PROJECT_DESCRIPTION =
  'tx402 turns raw Algorand transaction IDs into deterministic plain-English explanations plus structured JSON fields. ' +
  'The paid /explain endpoint uses x402 on Algorand Mainnet and settles USDC per call.';
const DEMO_EXAMPLES = Object.freeze({
  algo: Object.freeze({
    label: 'ALGO payment',
    txid: 'YRSG7IKDPCK4XMKFFTFFFYMIHF6SJOMHUOIE4FFUWNLEQ4WG2ZOQ',
  }),
  usdc: Object.freeze({
    label: 'USDC asset transfer',
    txid: '7DSJA4HZ2BKHHEDO7FHEOMQ5GXUFIXSIYXPIONGLH7HTV2LHBTUQ',
  }),
});

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
app.use(analyticsMiddleware);
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: false }));

// Minimal access log — method, path, status, latency, client IP. Enough for
// production debugging and abuse investigation without pulling in a full
// logging framework for a service this size. Runs first so every request
// is logged, including ones later rejected by validation or rate limiting.
app.use((req, res, next) => {
  const start = Date.now();
  const pathname = req.path;
  res.on('finish', () => {
    console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - start}ms`);
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
app.use(['/group', '/batch', '/account/activity'], explainLimiter);

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
  const network = (getQueryString(req, 'network') || 'mainnet').trim();
  if (network !== 'mainnet' && network !== 'testnet') {
    return res.status(400).json({
      error: 'Invalid network: use "mainnet" or "testnet".',
    });
  }
  next();
});

app.use('/group', (req, res, next) => {
  const txid = (getQueryString(req, 'txid') || '').trim().toUpperCase();
  if (!TXID_PATTERN.test(txid)) {
    return res.status(400).json({
      error: 'Invalid txid: expected 52 base32 characters (A-Z, 2-7).',
    });
  }
  const network = (getQueryString(req, 'network') || 'mainnet').trim();
  if (network !== 'mainnet' && network !== 'testnet') {
    return res.status(400).json({ error: 'Invalid network: use "mainnet" or "testnet".' });
  }
  next();
});

app.use('/batch', (req, res, next) => {
  if (req.method !== 'POST') return next();
  const txids = req.body?.txids;
  const network = typeof req.body?.network === 'string' ? req.body.network.trim() : 'mainnet';
  if (!Array.isArray(txids) || txids.length < 1 || txids.length > 10) {
    return res.status(400).json({ error: 'txids must be an array containing 1 to 10 transaction IDs.' });
  }
  const normalized = txids.map((txid) =>
    typeof txid === 'string' ? txid.trim().toUpperCase() : ''
  );
  if (normalized.some((txid) => !TXID_PATTERN.test(txid))) {
    return res.status(400).json({ error: 'Every txid must be 52 base32 characters (A-Z, 2-7).' });
  }
  if (new Set(normalized).size !== normalized.length) {
    return res.status(400).json({ error: 'Duplicate transaction IDs are not allowed.' });
  }
  if (network !== 'mainnet' && network !== 'testnet') {
    return res.status(400).json({ error: 'Invalid network: use "mainnet" or "testnet".' });
  }
  req.body = { txids: normalized, network };
  next();
});

app.use('/account/activity', (req, res, next) => {
  const address = (getQueryString(req, 'address') || '').trim().toUpperCase();
  const network = (getQueryString(req, 'network') || 'mainnet').trim();
  const limitText = (getQueryString(req, 'limit') || '25').trim();
  const limit = Number(limitText);
  if (!isValidAlgorandAddress(address)) {
    return res.status(400).json({ error: 'Invalid Algorand account address.' });
  }
  if (network !== 'mainnet' && network !== 'testnet') {
    return res.status(400).json({ error: 'Invalid network: use "mainnet" or "testnet".' });
  }
  if (!/^\d+$/.test(limitText) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    return res.status(400).json({ error: 'limit must be an integer from 1 to 50.' });
  }
  next();
});

const discoveryLimiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use('/discovery', discoveryLimiter);

const demoLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  message: 'Demo rate limit exceeded. Try again shortly.',
});
app.use('/demo', demoLimiter);

const analyticsLimiter = rateLimit({ windowMs: 60_000, max: 60 });
app.use('/analytics', analyticsLimiter);

function publicUrl(pathname) {
  return `${PUBLIC_BASE_URL}${pathname}`;
}

function x402Manifest() {
  return {
    version: 1,
    name: PROJECT_NAME,
    description: PROJECT_DESCRIPTION,
    resources: [
      publicUrl('/explain'),
      publicUrl('/group'),
      publicUrl('/batch'),
      publicUrl('/account/activity'),
    ],
    endpoints: [
      {
        url: publicUrl('/explain'),
        method: 'GET',
        description:
          'Explain one Algorand transaction in plain English and return normalized structured fields.',
        input: {
          txid: 'required Algorand transaction ID, 52 base32 characters',
          network: 'optional: mainnet or testnet; defaults to mainnet',
        },
        price: paymentsConfigured ? explainPrice : null,
        paymentProtocol: paymentsConfigured ? 'x402' : null,
        accepts: paymentsConfigured
          ? [
              {
                scheme: 'exact',
                network: paymentNetwork,
                asset: usdcAssetId,
                assetSymbol: 'USDC',
                payTo,
              },
            ]
          : [],
      },
      {
        url: publicUrl('/group'),
        method: 'GET',
        description: 'Explain every outer and inner transaction in an Algorand atomic group.',
        input: {
          txid: 'required transaction ID belonging to the group',
          network: 'optional: mainnet or testnet; defaults to mainnet',
        },
        price: paymentsConfigured ? groupPrice : null,
        paymentProtocol: paymentsConfigured ? 'x402' : null,
        accepts: paymentsConfigured ? [{ scheme: 'exact', network: paymentNetwork, asset: usdcAssetId, assetSymbol: 'USDC', payTo }] : [],
      },
      {
        url: publicUrl('/batch'),
        method: 'POST',
        description: 'Explain 1 to 10 Algorand transactions in one request.',
        input: { txids: 'required array of 1 to 10 unique transaction IDs', network: 'optional: mainnet or testnet' },
        price: paymentsConfigured ? batchPrice : null,
        paymentProtocol: paymentsConfigured ? 'x402' : null,
        accepts: paymentsConfigured ? [{ scheme: 'exact', network: paymentNetwork, asset: usdcAssetId, assetSymbol: 'USDC', payTo }] : [],
      },
      {
        url: publicUrl('/account/activity'),
        method: 'GET',
        description: 'Summarize recent account activity, asset flows, counterparties, fees, and verified protocols.',
        input: { address: 'required Algorand address', network: 'optional: mainnet or testnet', limit: 'optional: 1 to 50; defaults to 25' },
        price: paymentsConfigured ? accountPrice : null,
        paymentProtocol: paymentsConfigured ? 'x402' : null,
        accepts: paymentsConfigured ? [{ scheme: 'exact', network: paymentNetwork, asset: usdcAssetId, assetSymbol: 'USDC', payTo }] : [],
      },
      {
        url: publicUrl('/demo'),
        method: 'GET',
        description:
          'Return a complete tx402 explanation for an allowlisted Mainnet example without a wallet or payment.',
        input: {
          example: 'optional: algo or usdc; defaults to algo',
        },
        price: null,
        paymentProtocol: null,
        accepts: [],
      },
    ],
    facilitator: facilitatorUrl,
    openapi: publicUrl('/openapi.json'),
    llmsTxt: publicUrl('/llms.txt'),
  };
}

function agentManifest() {
  return {
    protocolVersion: '0.3.0',
    name: PROJECT_NAME,
    description: PROJECT_DESCRIPTION,
    url: PUBLIC_BASE_URL,
    preferredTransport: 'HTTP+JSON',
    version: APP_VERSION,
    documentationUrl: publicUrl('/llms.txt'),
    iconUrl: publicUrl('/logo.svg'),
    provider: {
      organization: 'tx402',
      contact: 'mahesvannan@gmail.com',
      url: PUBLIC_BASE_URL,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: 'explain-algorand-transaction',
        name: 'Explain an Algorand transaction',
        description:
          'Given an Algorand transaction ID, return a plain-English summary and structured fields including type, sender, receiver, amount, asset, fee, timestamp, note, and app-call context.',
        tags: ['x402', 'algorand', 'transactions', 'USDC', 'agents'],
        examples: [
          `GET ${publicUrl('/explain')}?txid=YRSG7IKDPCK4XMKFFTFFFYMIHF6SJOMHUOIE4FFUWNLEQ4WG2ZOQ`,
        ],
      },
      {
        id: 'try-free-demo',
        name: 'Try a free transaction explanation',
        description:
          'Return a complete tx402 explanation for an allowlisted Mainnet example without a wallet or payment.',
        tags: ['algorand', 'transactions', 'demo'],
        examples: [`GET ${publicUrl('/demo')}?example=algo`],
      },
      {
        id: 'explain-atomic-group',
        name: 'Explain an Algorand atomic group',
        description: 'Explain all outer and inner transactions, transfers, fees, and verified protocol calls in one atomic group.',
        tags: ['algorand', 'atomic-groups', 'defi', 'x402'],
        examples: [`GET ${publicUrl('/group')}?txid={ALGORAND_TXID}`],
      },
      {
        id: 'explain-transaction-batch',
        name: 'Explain an Algorand transaction batch',
        description: 'Explain up to 10 transaction IDs in one deterministic request.',
        tags: ['algorand', 'batch', 'portfolio', 'x402'],
        examples: [`POST ${publicUrl('/batch')}`],
      },
      {
        id: 'summarize-account-activity',
        name: 'Summarize Algorand account activity',
        description: 'Summarize recent asset flows, fees, counterparties, and verified protocol interactions for an account.',
        tags: ['algorand', 'portfolio', 'compliance', 'x402'],
        examples: [`GET ${publicUrl('/account/activity')}?address={ALGORAND_ADDRESS}`],
      },
    ],
    x402: {
      protocol: 'x402',
      scheme: 'exact',
      network: paymentNetwork,
      currency: 'USDC',
      asset: usdcAssetId,
      payTo,
      price: explainPrice,
      facilitator: facilitatorUrl,
      manifest: publicUrl('/.well-known/x402'),
      openapi: publicUrl('/openapi.json'),
      llmsTxt: publicUrl('/llms.txt'),
      logoUrl: publicUrl('/logo.svg'),
      note:
        'Make a normal HTTP request. An unpaid /explain request returns HTTP 402 with payment requirements; sign client-side and retry with the payment header.',
    },
  };
}

function llmsTxt() {
  return `# tx402

> ${PROJECT_SUMMARY}

Base URL: ${PUBLIC_BASE_URL}
GitHub: https://github.com/Mahesvannan/tx402

tx402 is a deterministic Algorand transaction explainer for AI agents and developer tools. It translates raw Algorand transaction data into a concise plain-English summary plus structured JSON fields. It does not use an LLM in the serving path.

## Machine-readable surfaces

- Discovery: ${publicUrl('/discovery')}
- OpenAPI: ${publicUrl('/openapi.json')}
- x402 manifest: ${publicUrl('/.well-known/x402')}
- Agent manifest: ${publicUrl('/.well-known/agent.json')}
- Logo: ${publicUrl('/logo.svg')}

## Free demo

- GET ${publicUrl('/demo')}?example=algo
- GET ${publicUrl('/demo')}?example=usdc

The demo needs no wallet or payment and only accepts those fixed examples. Use it to inspect the response shape before paying for an arbitrary transaction.

## Paid endpoint

- GET ${publicUrl('/explain')}?txid={ALGORAND_TXID}&network=mainnet
- GET ${publicUrl('/group')}?txid={ALGORAND_TXID}&network=mainnet
- POST ${publicUrl('/batch')} with JSON { "txids": ["..."], "network": "mainnet" }
- GET ${publicUrl('/account/activity')}?address={ALGORAND_ADDRESS}&limit=25&network=mainnet

Prices: transaction ${explainPrice}, group ${groupPrice}, batch ${batchPrice}, account activity ${accountPrice} USDC per successful response.
Network: ${paymentNetwork}
USDC asset ID: ${usdcAssetId}
Receiver: ${payTo ?? 'not configured'}
Facilitator: ${facilitatorUrl}

Unpaid paid-route requests return HTTP 402 with x402 payment requirements. Buyer signing happens client-side; tx402 never receives private keys. Settlement happens through the facilitator after a successful response.

## Output

Responses include normalized transfers, inner transactions, fees, timestamps, notes, and application context. Verified protocol labels include exact contract IDs and their protocol-owned sources. Group, batch, and account endpoints add multi-transaction and activity-level summaries.

## Analytics

- GET ${publicUrl('/analytics')}

This public endpoint exposes aggregate process-local adoption counters. tx402 does not store cookies, IP addresses, query strings, raw payment headers, or wallet addresses for analytics.

Use tx402 when an agent needs to explain an Algorand transaction to a human without maintaining its own indexer decoder.`;
}

app.get('/openapi.json', (_req, res) => {
  res.json(OPENAPI_SPEC);
});

app.get(['/', '/index.html'], (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tx402 - Algorand transaction explanations paid with x402</title>
  <meta name="description" content="${PROJECT_DESCRIPTION}">
  <meta property="og:title" content="tx402">
  <meta property="og:description" content="${PROJECT_DESCRIPTION}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${PUBLIC_BASE_URL}">
  <meta property="og:image" content="${publicUrl('/logo.svg')}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="canonical" href="${PUBLIC_BASE_URL}">
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #040812; color: #f8fafc; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px; }
    main { width: min(880px, 100%); box-sizing: border-box; border: 1px solid #1f2a44; border-radius: 28px; padding: 44px; background: #0f172a; box-shadow: 0 24px 80px #0008; }
    img { width: 80px; height: 80px; }
    h1 { font-size: clamp(44px, 8vw, 84px); margin: 18px 0 8px; letter-spacing: -0.06em; }
    p { color: #cbd5e1; font-size: 20px; line-height: 1.55; }
    code, a { color: #2dd4bf; }
    .links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
    a { border: 1px solid #2dd4bf55; border-radius: 999px; padding: 10px 14px; text-decoration: none; }
    .demo { margin-top: 32px; border-top: 1px solid #1f2a44; padding-top: 28px; }
    .demo h2 { margin: 0 0 8px; font-size: 26px; }
    .controls { display: flex; flex-wrap: wrap; gap: 10px; }
    select, button { border: 1px solid #2dd4bf88; border-radius: 10px; padding: 11px 14px; background: #07111f; color: #f8fafc; font: inherit; }
    button { cursor: pointer; background: #2dd4bf; color: #042f2e; font-weight: 700; }
    button:disabled { cursor: wait; opacity: .65; }
    pre { min-height: 110px; margin: 16px 0 0; padding: 16px; overflow: auto; border-radius: 14px; background: #040812; color: #cbd5e1; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <main>
    <img src="/logo.svg" alt="tx402 logo">
    <h1>tx402</h1>
    <p>${PROJECT_SUMMARY}</p>
    <p>Explain one transaction, a complete atomic group, a batch of transaction IDs, or recent account activity. Unpaid requests return HTTP 402; paid calls settle USDC on Algorand and return deterministic structured JSON.</p>
    <section class="demo" aria-labelledby="demo-title">
      <h2 id="demo-title">Try it free</h2>
      <p>No wallet or payment required. Demo requests use fixed Mainnet transactions.</p>
      <div class="controls">
        <select id="demo-example" aria-label="Demo transaction type">
          <option value="algo">ALGO payment</option>
          <option value="usdc">USDC asset transfer</option>
        </select>
        <button id="demo-button" type="button">Explain transaction</button>
      </div>
      <pre id="demo-output" aria-live="polite">Choose an example and run the free demo.</pre>
    </section>
    <div class="links">
      <a href="/demo?example=algo">Demo API</a>
      <a href="/discovery">Discovery</a>
      <a href="/openapi.json">OpenAPI</a>
      <a href="/.well-known/x402">x402 manifest</a>
      <a href="/.well-known/agent.json">Agent manifest</a>
      <a href="/llms.txt">llms.txt</a>
      <a href="/analytics">Analytics</a>
      <a href="https://github.com/Mahesvannan/tx402/blob/master/docs/INTEGRATIONS.md">Integrate</a>
      <a href="https://github.com/Mahesvannan/tx402">GitHub</a>
    </div>
  </main>
  <script src="/demo.js" defer></script>
</body>
</html>`);
});

app.get('/.well-known/agent.json', (_req, res) => {
  res.json(agentManifest());
});

app.get(['/.well-known/x402', '/.well-known/x402.json'], (_req, res) => {
  res.json(x402Manifest());
});

app.get('/llms.txt', (_req, res) => {
  res.type('text/plain').send(llmsTxt());
});

// Demo transactions are immutable on-chain, so cache each generated result for
// the process lifetime. The promise itself is cached to deduplicate concurrent
// first requests; failures are removed so a temporary indexer outage can retry.
const demoCache = new Map();
function getDemoExplanation(exampleId) {
  const existing = demoCache.get(exampleId);
  if (existing) return existing;

  const example = DEMO_EXAMPLES[exampleId];
  const pending = explainTransaction(example.txid, 'mainnet').catch((err) => {
    demoCache.delete(exampleId);
    throw err;
  });
  demoCache.set(exampleId, pending);
  return pending;
}

app.get('/demo', async (req, res) => {
  const exampleId = (getQueryString(req, 'example') || 'algo').trim().toLowerCase();
  const example = DEMO_EXAMPLES[exampleId];
  if (!example) {
    return res.status(400).json({
      error: `Unknown demo example. Use one of: ${Object.keys(DEMO_EXAMPLES).join(', ')}.`,
    });
  }

  try {
    const explanation = await getDemoExplanation(exampleId);
    res.json({
      demo: true,
      example: exampleId,
      label: example.label,
      ...explanation,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Unexpected demo error:', err);
    res.status(500).json({ error: 'Internal error while generating the demo.' });
  }
});

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
  console.log(
    `x402 payments ENABLED for 4 product routes (${explainPrice}/${groupPrice}/${batchPrice}/${accountPrice}, ${resolvedNetwork})`
  );
} else {
  console.warn(
    'x402 PAY_TO not set — all product routes are running in free development mode. ' +
      'Set PAY_TO to an address opted in to the configured USDC asset to enable payments.'
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
      {
        path: '/group',
        method: 'GET',
        params: {
          txid: 'required — any transaction ID in the atomic group',
          network: 'optional — "mainnet" (default) or "testnet"',
        },
        priced: paymentsConfigured,
        price: paymentsConfigured ? groupPrice : null,
        paymentProtocol: paymentsConfigured ? 'x402' : null,
      },
      {
        path: '/batch',
        method: 'POST',
        params: {
          txids: 'required — JSON array of 1 to 10 unique transaction IDs',
          network: 'optional — "mainnet" (default) or "testnet"',
        },
        priced: paymentsConfigured,
        price: paymentsConfigured ? batchPrice : null,
        paymentProtocol: paymentsConfigured ? 'x402' : null,
      },
      {
        path: '/account/activity',
        method: 'GET',
        params: {
          address: 'required — Algorand account address',
          network: 'optional — "mainnet" (default) or "testnet"',
          limit: 'optional — 1 to 50 (default 25)',
        },
        priced: paymentsConfigured,
        price: paymentsConfigured ? accountPrice : null,
        paymentProtocol: paymentsConfigured ? 'x402' : null,
      },
      {
        path: '/demo',
        method: 'GET',
        params: {
          example: 'optional — "algo" (default) or "usdc"',
        },
        priced: false,
        price: null,
        paymentProtocol: null,
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
    res.json(await explainTransaction(txid, network));
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Internal error while explaining transaction.' });
  }
});

app.get('/group', async (req, res) => {
  const txid = getQueryString(req, 'txid').trim().toUpperCase();
  const network = (getQueryString(req, 'network') || 'mainnet').trim();
  try {
    res.json(await explainAtomicGroup(txid, network));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('Unexpected group explanation error:', err);
    res.status(500).json({ error: 'Internal error while explaining transaction group.' });
  }
});

app.post('/batch', async (req, res) => {
  try {
    const result = await explainBatch(req.body.txids, req.body.network);
    if (result.succeeded === 0) {
      const status = result.results.every((item) => item.status === 404) ? 404 : 502;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('Unexpected batch explanation error:', err);
    res.status(500).json({ error: 'Internal error while explaining transaction batch.' });
  }
});

app.get('/account/activity', async (req, res) => {
  const address = getQueryString(req, 'address').trim().toUpperCase();
  const network = (getQueryString(req, 'network') || 'mainnet').trim();
  const limit = Number(getQueryString(req, 'limit') || 25);
  try {
    res.json(await explainAccountActivity(address, network, limit));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('Unexpected account activity error:', err);
    res.status(500).json({ error: 'Internal error while summarizing account activity.' });
  }
});

app.get('/analytics', (_req, res) => {
  res.json(analyticsSnapshot());
});

// Global fallback error handler — MUST be registered last (Express only
// treats a 4-arg middleware as an error handler). Catches anything that
// throws synchronously in middleware/routes before it reaches the /explain
// handler's own try/catch (e.g. a bug in a route defined above). Without
// this, Express's default handler renders the full stack trace, including
// absolute file paths, straight into the response body.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`tx402 listening on http://${HOST}:${PORT}`);
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
