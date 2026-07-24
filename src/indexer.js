/**
 * Thin client over Algorand's public indexer.
 *
 * We use AlgoNode's free public endpoints. No API key required, no account
 * needed. If you later hit rate limits, swap INDEXER_URL for a paid provider
 * (Nodely, Blockdaemon) via env var — nothing else in the codebase changes.
 */

import { lookupAsset } from './knownApps.js';

const NETWORKS = {
  mainnet: 'https://mainnet-idx.algonode.cloud',
  testnet: 'https://testnet-idx.algonode.cloud',
};

const TIMEOUT_MS = 8000;

function indexerUrl(network) {
  const base = NETWORKS[network];
  if (!base) {
    throw new HttpError(400, `Unknown network "${network}". Use "mainnet" or "testnet".`);
  }
  return process.env.INDEXER_URL || base;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new HttpError(504, 'Indexer request timed out.');
    }
    throw new HttpError(502, `Could not reach the Algorand indexer: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new HttpError(404, 'Not found on this network.');
  }
  if (!res.ok) {
    throw new HttpError(502, `Indexer returned HTTP ${res.status}.`);
  }

  return res.json();
}

/**
 * Fetch a single transaction by ID.
 * Returns the raw `transaction` object from the indexer.
 */
export async function fetchTransaction(txid, network = 'mainnet') {
  const url = `${indexerUrl(network)}/v2/transactions/${encodeURIComponent(txid)}`;
  const body = await getJson(url);
  if (!body?.transaction) {
    throw new HttpError(404, `Transaction ${txid} not found on ${network}.`);
  }
  return body.transaction;
}

/**
 * Resolve an ASA id to { name, unitName, decimals }.
 * Checks the local cache first, then falls back to the indexer.
 * Never throws — an unknown asset degrades gracefully to a generic label.
 */
export async function fetchAsset(assetId, network = 'mainnet') {
  const cached = lookupAsset(assetId);
  if (cached) return cached;

  try {
    const url = `${indexerUrl(network)}/v2/assets/${Number(assetId)}`;
    const body = await getJson(url);
    const p = body?.asset?.params ?? {};
    return {
      name: p.name || `ASA ${assetId}`,
      unitName: p['unit-name'] || `ASA${assetId}`,
      decimals: typeof p.decimals === 'number' ? p.decimals : 0,
      verified: false,
    };
  } catch {
    return {
      name: `ASA ${assetId}`,
      unitName: `ASA${assetId}`,
      decimals: 0,
      verified: false,
    };
  }
}
