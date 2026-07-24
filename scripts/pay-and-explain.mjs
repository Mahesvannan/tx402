/**
 * Buyer-side proof: pay for /explain over x402 and print the result.
 *
 * This is the CLIENT half of the loop. It uses the buyer wallet's key to
 * sign an Algorand USDC transfer when the server answers 402, then retries
 * with the signed payment attached — all handled by wrapFetchWithPayment.
 *
 * Reads the throwaway Testnet buyer mnemonic from
 * .testnet-buyer-wallet.local.json (gitignored). Never used on Mainnet.
 *
 * Run:  node scripts/pay-and-explain.mjs [txid]
 */

import fs from 'node:fs';
import algosdk from 'algosdk';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactAvmScheme } from '@x402/avm/exact/client';
import { toClientAvmSigner } from '@x402/avm';

const SERVER = process.env.TX402_URL || 'http://localhost:4021';
const NETWORK =
  process.env.NETWORK || 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=';
const ALGOD_URL = process.env.ALGOD_URL || 'https://testnet-api.algonode.cloud';
const TXID =
  process.argv[2] || '7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ';

// Load the buyer key and hand it to the x402 AVM signer as base64.
const wallet = JSON.parse(
  fs.readFileSync('.testnet-buyer-wallet.local.json', 'utf8')
);
const acct = algosdk.mnemonicToSecretKey(wallet.mnemonic);
const signer = toClientAvmSigner(Buffer.from(acct.sk).toString('base64'));

const client = new x402Client();
client.register(NETWORK, new ExactAvmScheme(signer, { algodUrl: ALGOD_URL }));

// Trace the payment lifecycle so we can see exactly where it succeeds/fails.
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
