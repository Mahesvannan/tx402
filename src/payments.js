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
import { ALGORAND_TESTNET_CAIP2, USDC_TESTNET_ASA_ID } from '@x402/avm';

dotenv.config();

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://facilitator.goplausible.xyz';
const NETWORK = process.env.NETWORK || ALGORAND_TESTNET_CAIP2;
const USDC_ASSET_ID = process.env.USDC_ASSET_ID
  ? Number(process.env.USDC_ASSET_ID)
  : USDC_TESTNET_ASA_ID;
const PAY_TO = process.env.PAY_TO;
const EXPLAIN_PRICE = process.env.EXPLAIN_PRICE_USD || '$0.005';

export const paymentsConfigured = Boolean(PAY_TO);

export const explainPrice = EXPLAIN_PRICE;

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
