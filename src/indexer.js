/**
 * Thin client over Algorand's public indexer.
 *
 * We use AlgoNode's free public endpoints. No API key required, no account
 * needed. If you later hit rate limits, swap MAINNET_INDEXER_URL /
 * TESTNET_INDEXER_URL for a paid provider (Nodely, Blockdaemon) via env
 * var — nothing else in the codebase changes.
 */

import { lookupAsset } from './knownApps.js';

const NETWORKS = {
  mainnet: 'https://mainnet-idx.algonode.cloud',
  testnet: 'https://testnet-idx.algonode.cloud',
};

// Per-network override env vars — deliberately NOT a single shared
// INDEXER_URL, which would silently point both networks at whichever one
// you last configured.
const OVERRIDE_ENV_VARS = {
  mainnet: 'MAINNET_INDEXER_URL',
  testnet: 'TESTNET_INDEXER_URL',
};

const TIMEOUT_MS = 8000;

function indexerUrl(network) {
  const base = NETWORKS[network];
  if (!base) {
    throw new HttpError(400, `Unknown network "${network}". Use "mainnet" or "testnet".`);
  }
  return process.env[OVERRIDE_ENV_VARS[network]] || base;
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

  // The timer stays alive across both the request AND the body read below,
  // so a slow/hanging body (not just slow headers) is also bounded by
  // TIMEOUT_MS — aborting the controller mid-stream rejects res.json() too.
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });

    if (res.status === 404) {
      throw new HttpError(404, 'Not found on this network.');
    }
    if (!res.ok) {
      throw new HttpError(502, `Indexer returned HTTP ${res.status}.`);
    }

    return await res.json();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.name === 'AbortError') {
      throw new HttpError(504, 'Indexer request timed out.');
    }
    throw new HttpError(502, `Could not reach the Algorand indexer: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Readiness probe for the deep /health check (D3) — pings the indexer's own
 * /health endpoint with a short timeout. Never throws: an unreachable
 * indexer is a "not ready" signal, not a server crash.
 */
export async function checkIndexerHealth(network, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${indexerUrl(network)}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
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

/** Fetch every outer transaction in the atomic group containing a transaction. */
export async function fetchTransactionGroup(groupId, network = 'mainnet') {
  if (!groupId) throw new HttpError(400, 'The transaction is not part of an atomic group.');
  const query = new URLSearchParams({ 'group-id': groupId });
  const body = await getJson(`${indexerUrl(network)}/v2/transactions?${query}`);
  const transactions = body?.transactions ?? [];
  if (transactions.length === 0) {
    throw new HttpError(404, 'Atomic transaction group not found on this network.');
  }
  return transactions.sort(
    (a, b) => (a['intra-round-offset'] ?? 0) - (b['intra-round-offset'] ?? 0)
  );
}

/** Fetch recent transactions involving an account, newest first. */
export async function fetchAccountTransactions(address, network = 'mainnet', limit = 25) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 25, 50));
  const query = new URLSearchParams({ limit: String(boundedLimit) });
  const body = await getJson(
    `${indexerUrl(network)}/v2/accounts/${encodeURIComponent(address)}/transactions?${query}`
  );
  return (body?.transactions ?? []).sort((a, b) => {
    const roundDiff = (b['confirmed-round'] ?? 0) - (a['confirmed-round'] ?? 0);
    return roundDiff || (b['intra-round-offset'] ?? 0) - (a['intra-round-offset'] ?? 0);
  });
}

/**
 * Resolve an ASA id to { name, unitName, decimals }.
 * Checks the local cache first, then falls back to the indexer.
 * Never throws — an unknown asset degrades gracefully to a generic label.
 */
export async function fetchAsset(assetId, network = 'mainnet') {
  const cached = lookupAsset(assetId, network);
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
