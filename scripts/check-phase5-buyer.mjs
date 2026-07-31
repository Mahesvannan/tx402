/**
 * Phase 5 buyer preflight.
 *
 * Verifies a buyer account can attempt the first real Mainnet payment:
 *   - BUYER_ADDRESS, or a local wallet file, identifies the buyer
 *   - account exists on Mainnet
 *   - account has spendable ALGO for fees/min balance
 *   - account has at least the quoted USDC amount
 *
 * Usage:
 *   npm run phase5:check
 *
 * Optional:
 *   BUYER_ADDRESS=... npm run phase5:check
 *   BUYER_WALLET_FILE=.mainnet-buyer-wallet.local.json npm run phase5:check
 */

import fs from 'node:fs';
import dotenv from 'dotenv';
import algosdk from 'algosdk';
import { USDC_MAINNET_ASA_ID, isValidAlgorandAddress } from '@x402/avm';

dotenv.config({ quiet: true });

const MAINNET_INDEXER_URL = process.env.MAINNET_INDEXER_URL || 'https://mainnet-idx.algonode.cloud';
const BUYER_ADDRESS = process.env.BUYER_ADDRESS;
const WALLET_FILE = process.env.BUYER_WALLET_FILE || '.mainnet-buyer-wallet.local.json';
const MAINNET_USDC_ASSET_ID = Number(USDC_MAINNET_ASA_ID);
const REQUIRED_USDC_BASE_UNITS = Number(process.env.REQUIRED_USDC_BASE_UNITS || 5000);
const MIN_ALGO_BASE_UNITS = Number(process.env.MIN_ALGO_BASE_UNITS || 300000);

class PreflightError extends Error {}

function fail(message) {
  throw new PreflightError(message);
}

function resolveBuyer() {
  if (BUYER_ADDRESS) {
    if (!isValidAlgorandAddress(BUYER_ADDRESS)) {
      fail('BUYER_ADDRESS is not a valid Algorand address.');
    }
    return { buyerAddress: BUYER_ADDRESS, hasSigningWallet: false };
  }

  if (!fs.existsSync(WALLET_FILE)) {
    fail(`Missing buyer wallet file: ${WALLET_FILE}`);
  }

  let wallet;
  try {
    wallet = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
  } catch (err) {
    fail(`Could not read wallet JSON: ${err.message}`);
  }

  try {
    const acct = algosdk.mnemonicToSecretKey(wallet.mnemonic);
    return { buyerAddress: String(acct.addr), hasSigningWallet: true };
  } catch {
    fail('Wallet file does not contain a valid Algorand mnemonic.');
  }
}

async function main() {
  const { buyerAddress, hasSigningWallet } = resolveBuyer();

  console.log('Phase 5 Mainnet buyer preflight');
  console.log(`Buyer: ${buyerAddress}`);
  console.log(`Signing wallet: ${hasSigningWallet ? WALLET_FILE : 'not checked'}`);

  let accountRes;
  try {
    accountRes = await fetch(`${MAINNET_INDEXER_URL}/v2/accounts/${encodeURIComponent(buyerAddress)}`, {
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    fail(`Mainnet account lookup failed: ${err.message}`);
  }

  if (accountRes.status === 404) {
    fail('Buyer account was not found on Mainnet. Fund it before attempting Phase 5.');
  }

  if (!accountRes.ok) {
    fail(`Mainnet account lookup returned HTTP ${accountRes.status}`);
  }

  const body = await accountRes.json();
  const account = body.account;
  console.log('PASS buyer account exists on Mainnet');

  if (Number(account.amount) < MIN_ALGO_BASE_UNITS) {
    fail(
      `Buyer has ${account.amount} microALGO; expected at least ${MIN_ALGO_BASE_UNITS} ` +
        'for fees and minimum balance.'
    );
  }
  console.log('PASS buyer has enough ALGO for fees/min balance');

  const assets = account.assets || [];
  const usdcHolding = assets.find((asset) => Number(asset['asset-id']) === MAINNET_USDC_ASSET_ID);
  if (!usdcHolding) {
    fail(`Buyer is not opted into Mainnet USDC asset ${MAINNET_USDC_ASSET_ID}.`);
  }

  if (Number(usdcHolding.amount) < REQUIRED_USDC_BASE_UNITS) {
    fail(
      `Buyer has ${usdcHolding.amount} USDC base units; expected at least ` +
        `${REQUIRED_USDC_BASE_UNITS}.`
    );
  }

  console.log('PASS buyer has enough Mainnet USDC');
  if (!hasSigningWallet) {
    console.log('NOTE BUYER_ADDRESS preflight passed, but settlement still requires a local buyer wallet file.');
  }
  console.log('Phase 5 buyer preflight complete.');
}

try {
  await main();
} catch (err) {
  if (err instanceof PreflightError) {
    console.error(`FAIL: ${err.message}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
