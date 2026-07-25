/**
 * x402 payment gate for Algorand (AVM), via the hosted GoPlausible facilitator.
 *
 * PHASE 2: pay-per-call middleware for /explain. Settlement happens off to
 * the facilitator at FACILITATOR_URL — this file never touches private keys
 * or signs anything; it only declares a price and lets @x402/express verify
 * + settle payments through that facilitator.
 *
 * If PAY_TO is not set in the environment, buildPaymentGate() returns null
 * and index.js falls back to Phase 1 behaviour (explain stays free) rather
 * than crashing the server. That fallback is intentional during setup, but
 * it is logged loudly so nobody ships it by accident.
 */

import dotenv from 'dotenv';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactAvmScheme } from '@x402/avm/exact/server';
import {
  ALGORAND_TESTNET_CAIP2,
  USDC_TESTNET_ASA_ID,
  USDC_MAINNET_ASA_ID,
  getNetworkFromCaip2,
  isValidAlgorandAddress,
} from '@x402/avm';

dotenv.config({ quiet: true });

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://facilitator.goplausible.xyz';
const NETWORK = process.env.NETWORK || ALGORAND_TESTNET_CAIP2;

// Default the USDC asset from whichever network we're actually pointed at —
// never hardcode Testnet. Flipping NETWORK to Mainnet without also setting
// USDC_ASSET_ID must not silently quote the Testnet USDC asset id there.
//
// @x402/avm exports its ASA id constants as strings, so every comparison
// here goes through Number() — comparing a coerced env var against a raw
// string constant would silently never match.
const RESOLVED_NETWORK = getNetworkFromCaip2(NETWORK);
const TESTNET_USDC_ASSET_ID = Number(USDC_TESTNET_ASA_ID);
const MAINNET_USDC_ASSET_ID = Number(USDC_MAINNET_ASA_ID);
const DEFAULT_USDC_ASSET_ID =
  RESOLVED_NETWORK === 'mainnet' ? MAINNET_USDC_ASSET_ID : TESTNET_USDC_ASSET_ID;
let USDC_ASSET_ID = DEFAULT_USDC_ASSET_ID;
if (process.env.USDC_ASSET_ID) {
  USDC_ASSET_ID = Number(process.env.USDC_ASSET_ID);
  if (!Number.isInteger(USDC_ASSET_ID) || USDC_ASSET_ID <= 0) {
    throw new Error(
      `USDC_ASSET_ID ("${process.env.USDC_ASSET_ID}") is not a positive integer. ` +
        'Fix .env before starting the server.'
    );
  }
}

// Belt-and-suspenders: even an *explicit* USDC_ASSET_ID that is the other
// network's canonical USDC id is almost certainly a stale .env left over
// from switching NETWORK — refuse to boot rather than quote the wrong asset.
const WRONG_NETWORK_USDC_ID =
  RESOLVED_NETWORK === 'mainnet' ? TESTNET_USDC_ASSET_ID : MAINNET_USDC_ASSET_ID;
if (USDC_ASSET_ID === WRONG_NETWORK_USDC_ID) {
  throw new Error(
    `USDC_ASSET_ID (${USDC_ASSET_ID}) is the ${RESOLVED_NETWORK === 'mainnet' ? 'Testnet' : 'Mainnet'} ` +
      `USDC asset id, but NETWORK is set to ${RESOLVED_NETWORK}. This looks like a stale .env — ` +
      'update USDC_ASSET_ID (or remove it to auto-derive from NETWORK) before starting the server.'
  );
}

const PAY_TO = process.env.PAY_TO;
if (PAY_TO && !isValidAlgorandAddress(PAY_TO)) {
  throw new Error(
    `PAY_TO ("${PAY_TO}") is not a valid Algorand address. Fix .env before starting the server.`
  );
}

const EXPLAIN_PRICE = process.env.EXPLAIN_PRICE_USD || '$0.005';

export const paymentsConfigured = Boolean(PAY_TO);

export const explainPrice = EXPLAIN_PRICE;

/** 'mainnet' or 'testnet' — for status messages, never hardcode "Testnet" instead. */
export const resolvedNetwork = RESOLVED_NETWORK;

/**
 * Readiness probe for the deep /health check (D3) — pings the facilitator's
 * own /health endpoint with a short timeout. Never throws: an unreachable
 * facilitator is a "not ready" signal, not a server crash. Only meaningful
 * when payments are configured; callers should skip it otherwise.
 */
export async function checkFacilitatorHealth(timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${FACILITATOR_URL}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {import('express').RequestHandler | null} the payment middleware,
 * or null if PAY_TO isn't configured yet.
 */
export function buildPaymentGate() {
  if (!paymentsConfigured) return null;

  const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const server = new x402ResourceServer(facilitatorClient);
  server.register(NETWORK, new ExactAvmScheme());

  const routes = {
    'GET /explain': {
      accepts: {
        scheme: 'exact',
        network: NETWORK,
        payTo: PAY_TO,
        price: EXPLAIN_PRICE,
        extra: { asset: USDC_ASSET_ID },
      },
      description:
        'Plain-English explanation of an Algorand transaction, with normalised structured fields.',
    },
  };

  return paymentMiddleware(routes, server);
}
