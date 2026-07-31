/**
 * Public tx402 client example.
 *
 * Default mode is read-only: it fetches /discovery and shows the x402
 * payment challenge for /explain without spending funds.
 *
 * To actually pay, set:
 *   TX402_EXAMPLE_PAY=1
 *   BUYER_WALLET_FILE=.mainnet-buyer-wallet.local.json
 *   CONFIRM_MAINNET_PAYMENT=1
 */

import fs from 'node:fs';
import dotenv from 'dotenv';
import algosdk from 'algosdk';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactAvmScheme } from '@x402/avm/exact/client';
import {
  ALGORAND_MAINNET_CAIP2,
  getNetworkFromCaip2,
  toClientAvmSigner,
} from '@x402/avm';

dotenv.config({ quiet: true });

const SERVER = (process.env.TX402_URL || 'https://tx402-production.up.railway.app').replace(/\/+$/, '');
const NETWORK = process.env.NETWORK || ALGORAND_MAINNET_CAIP2;
const RESOLVED_NETWORK = getNetworkFromCaip2(NETWORK);
const TXID =
  process.argv[2] || '7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ';
const SHOULD_PAY = process.env.TX402_EXAMPLE_PAY === '1';

function decodePaymentChallenge(header) {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function buildPaidFetch() {
  if (RESOLVED_NETWORK === 'mainnet' && process.env.CONFIRM_MAINNET_PAYMENT !== '1') {
    throw new Error('Refusing to spend Mainnet funds without CONFIRM_MAINNET_PAYMENT=1.');
  }

  const walletFile =
    process.env.BUYER_WALLET_FILE ||
    (RESOLVED_NETWORK === 'mainnet'
      ? '.mainnet-buyer-wallet.local.json'
      : '.testnet-buyer-wallet.local.json');
  const algodUrl =
    process.env.ALGOD_URL ||
    (RESOLVED_NETWORK === 'mainnet'
      ? 'https://mainnet-api.algonode.cloud'
      : 'https://testnet-api.algonode.cloud');

  const wallet = JSON.parse(fs.readFileSync(walletFile, 'utf8'));
  const acct = algosdk.mnemonicToSecretKey(wallet.mnemonic);
  const signer = toClientAvmSigner(Buffer.from(acct.sk).toString('base64'));
  const client = new x402Client();
  client.register(NETWORK, new ExactAvmScheme(signer, { algodUrl }));

  console.log(`Buyer: ${signer.address}`);
  console.log(`Wallet: ${walletFile}`);

  return wrapFetchWithPayment(fetch, client);
}

console.log(`tx402: ${SERVER}`);

const discoveryRes = await fetch(`${SERVER}/discovery`);
const discovery = await discoveryRes.json();
console.log(`Discovery: priced=${discovery.routes?.[0]?.priced}, price=${discovery.routes?.[0]?.price}`);

const clientFetch = SHOULD_PAY ? buildPaidFetch() : fetch;
const explainRes = await clientFetch(`${SERVER}/explain?txid=${encodeURIComponent(TXID)}`);
const text = await explainRes.text();

console.log(`HTTP ${explainRes.status}`);

if (explainRes.status === 402) {
  const challenge = decodePaymentChallenge(explainRes.headers.get('payment-required'));
  console.log(JSON.stringify(challenge?.accepts?.[0] || challenge || {}, null, 2));
  process.exit(0);
}

try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}

if (!explainRes.ok) process.exit(1);
