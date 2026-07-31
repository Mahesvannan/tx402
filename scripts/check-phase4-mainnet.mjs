/**
 * Phase 4 Mainnet preflight.
 *
 * Checks whether the configured receiver can safely be used for Mainnet x402:
 *   - address is present and syntactically valid
 *   - Mainnet indexer is reachable
 *   - receiver account exists on Mainnet
 *   - receiver is opted into Mainnet USDC
 *   - facilitator health endpoint responds
 *
 * Usage:
 *   MAINNET_PAY_TO=<address> npm run phase4:check
 *
 * If MAINNET_PAY_TO is not set, the script falls back to PAY_TO from .env.
 */

import dotenv from 'dotenv';
import {
  ALGORAND_MAINNET_CAIP2,
  USDC_MAINNET_ASA_ID,
  isValidAlgorandAddress,
} from '@x402/avm';

dotenv.config({ quiet: true });

const MAINNET_INDEXER_URL = process.env.MAINNET_INDEXER_URL || 'https://mainnet-idx.algonode.cloud';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://facilitator.goplausible.xyz';
const PAY_TO = process.env.MAINNET_PAY_TO || process.env.PAY_TO;
const MAINNET_USDC_ASSET_ID = Number(USDC_MAINNET_ASA_ID);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function checkHttpOk(label, url) {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      fail(`${label} returned HTTP ${res.status}`);
      return null;
    }
    console.log(`PASS ${label}`);
    return res;
  } catch (err) {
    fail(`${label} is unreachable: ${err.message}`);
    return null;
  }
}

console.log('Phase 4 Mainnet preflight');
console.log(`NETWORK=${ALGORAND_MAINNET_CAIP2}`);
console.log(`USDC_ASSET_ID=${MAINNET_USDC_ASSET_ID}`);

if (!PAY_TO) {
  fail('Set MAINNET_PAY_TO or PAY_TO to a Mainnet receiver address.');
  process.exit();
}

if (!isValidAlgorandAddress(PAY_TO)) {
  fail('Receiver address is not a valid Algorand address.');
  process.exit();
}
console.log('PASS receiver address format');

await checkHttpOk('mainnet indexer health', `${MAINNET_INDEXER_URL}/health`);
await checkHttpOk('facilitator health', `${FACILITATOR_URL}/health`);

let accountRes;
try {
  accountRes = await fetch(`${MAINNET_INDEXER_URL}/v2/accounts/${encodeURIComponent(PAY_TO)}`, {
    headers: { accept: 'application/json' },
  });
} catch (err) {
  fail(`Mainnet account lookup failed: ${err.message}`);
  process.exit();
}

if (accountRes.status === 404) {
  fail('Receiver account was not found on Mainnet. Fund it and opt it into Mainnet USDC first.');
  process.exit();
}

if (!accountRes.ok) {
  fail(`Mainnet account lookup returned HTTP ${accountRes.status}`);
  process.exit();
}

const accountBody = await accountRes.json();
console.log('PASS receiver account exists on Mainnet');

const assets = accountBody.account?.assets || [];
const usdcHolding = assets.find((asset) => Number(asset['asset-id']) === MAINNET_USDC_ASSET_ID);
if (!usdcHolding) {
  fail(`Receiver is not opted into Mainnet USDC asset ${MAINNET_USDC_ASSET_ID}.`);
  process.exit();
}

console.log('PASS receiver is opted into Mainnet USDC');
console.log('Phase 4 preflight complete.');
