/**
 * tx402 — plain-English explanations of Algorand transactions.
 *
 * PHASE 2: /explain is now gated by x402 pay-per-call middleware, settled
 * on Algorand Testnet through the hosted GoPlausible facilitator. It only
 * activates once PAY_TO is set in the environment — see src/payments.js.
 */

import express from 'express';
import { fetchTransaction, fetchAsset, HttpError } from './indexer.js';
import { decodeTransaction } from './decoder.js';
import { narrate } from './narrator.js';
import { buildPaymentGate, paymentsConfigured, explainPrice } from './payments.js';

const app = express();
const PORT = process.env.PORT || 4021;

app.use(express.json());

const paymentGate = buildPaymentGate();
if (paymentGate) {
  app.use(paymentGate);
  console.log(`x402 payments ENABLED for /explain (${explainPrice} per call, Testnet)`);
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
  const txid = (req.query.txid || '').trim();
  const network = (req.query.network || 'mainnet').trim();

  if (!txid) {
    return res.status(400).json({ error: 'Missing required query parameter: txid' });
  }

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

app.listen(PORT, () => {
  console.log(`tx402 listening on http://localhost:${PORT}`);
  console.log(`  try: http://localhost:${PORT}/explain?txid=YOUR_TXID`);
});
