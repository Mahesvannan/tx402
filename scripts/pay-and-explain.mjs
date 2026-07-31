/**
 * Buyer-side proof: pay for /explain over x402 and print the result.
 *
 * This is the CLIENT half of the loop. It uses the buyer wallet's key to
 * sign an Algorand USDC transfer when the server answers 402, then retries
 * with the signed payment attached. wrapFetchWithPayment handles the x402
 * challenge/retry flow.
 *
 * Reads a local gitignored buyer mnemonic file:
 *   - Testnet: .testnet-buyer-wallet.local.json
 *   - Mainnet: .mainnet-buyer-wallet.local.json
 *
 * Run:
 *   node scripts/pay-and-explain.mjs [txid]
 *
 * Mainnet requires:
 *   CONFIRM_MAINNET_PAYMENT=1
 */

import fs from 'node:fs';
import dotenv from 'dotenv';
import algosdk from 'algosdk';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactAvmScheme } from '@x402/avm/exact/client';
import {
  ALGORAND_TESTNET_CAIP2,
  getNetworkFromCaip2,
  toClientAvmSigner,
} from '@x402/avm';

dotenv.config({ quiet: true });

const SERVER = (process.env.TX402_URL || 'http://localhost:4021').replace(/\/+$/, '');
const NETWORK = process.env.NETWORK || ALGORAND_TESTNET_CAIP2;
const RESOLVED_NETWORK = getNetworkFromCaip2(NETWORK);
const DEFAULT_ALGOD_URL =
  RESOLVED_NETWORK === 'mainnet'
    ? 'https://mainnet-api.algonode.cloud'
    : 'https://testnet-api.algonode.cloud';
const ALGOD_URL = process.env.ALGOD_URL || DEFAULT_ALGOD_URL;
const WALLET_FILE =
  process.env.BUYER_WALLET_FILE ||
  (RESOLVED_NETWORK === 'mainnet'
    ? '.mainnet-buyer-wallet.local.json'
    : '.testnet-buyer-wallet.local.json');
const TXID =
  process.argv[2] || '7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ';

if (RESOLVED_NETWORK === 'mainnet' && process.env.CONFIRM_MAINNET_PAYMENT !== '1') {
  console.error(
    'Refusing to spend Mainnet funds. Set CONFIRM_MAINNET_PAYMENT=1 after verifying ' +
      'BUYER_WALLET_FILE points to the intended Mainnet buyer wallet.'
  );
  process.exit(1);
}

if (RESOLVED_NETWORK !== 'mainnet' && NETWORK !== ALGORAND_TESTNET_CAIP2) {
  console.error(`Unsupported network: ${NETWORK}`);
  process.exit(1);
}

if (!fs.existsSync(WALLET_FILE)) {
  console.error(`Missing buyer wallet file: ${WALLET_FILE}`);
  console.error('Expected JSON shape: { "mnemonic": "..." }');
  process.exit(1);
}

// Load the buyer key and hand it to the x402 AVM signer as base64.
const wallet = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
const acct = algosdk.mnemonicToSecretKey(wallet.mnemonic);
const signer = toClientAvmSigner(Buffer.from(acct.sk).toString('base64'));

const client = new x402Client();
client.register(NETWORK, new ExactAvmScheme(signer, { algodUrl: ALGOD_URL }));

client.onAfterPaymentCreation?.(async () => {
  console.log('[trace] payment payload created + signed OK');
});
client.onPaymentCreationFailure?.(async ({ error }) => {
  console.log('[trace] payment CREATION failed:', error?.message || error);
});
client.onPaymentResponse?.(async ({ response }) => {
  console.log('[trace] server response to paid retry:', response?.status);
});

const fetchWithPay = wrapFetchWithPayment(fetch, client);

console.log(`Buyer:  ${signer.address}`);
console.log(`Network: ${RESOLVED_NETWORK}`);
console.log(`Wallet: ${WALLET_FILE}`);
console.log(`Paying: ${SERVER}/explain?txid=${TXID}\n`);

const res = await fetchWithPay(`${SERVER}/explain?txid=${TXID}`);
console.log(`HTTP ${res.status}`);

const body = await res.text();
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}

if (!res.ok) process.exit(1);
