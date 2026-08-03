import {
  fetchAccountTransactions,
  fetchAsset,
  fetchTransaction,
  fetchTransactionGroup,
} from './indexer.js';
import { decodeTransaction } from './decoder.js';
import { narrate } from './narrator.js';
import { buildAccountInsight, buildGroupInsight } from './insights.js';

function collectAssetIds(raw, ids) {
  if (raw?.['tx-type'] === 'axfer') {
    const assetId = raw['asset-transfer-transaction']?.['asset-id'];
    if (assetId !== undefined && assetId !== null) ids.add(Number(assetId));
  }
  for (const inner of raw?.['inner-txns'] ?? []) collectAssetIds(inner, ids);
}

async function decodeRawTransactions(rawTransactions, network) {
  const assetIds = new Set();
  for (const raw of rawTransactions) collectAssetIds(raw, assetIds);
  const assets = new Map(
    await Promise.all(
      [...assetIds].map(async (assetId) => [assetId, await fetchAsset(assetId, network)])
    )
  );
  return rawTransactions.map((raw) => decodeTransaction(raw, { assets, network }));
}

export async function explainTransaction(txid, network = 'mainnet') {
  const raw = await fetchTransaction(txid, network);
  const [decoded] = await decodeRawTransactions([raw], network);
  return {
    txid: decoded.txid,
    network,
    summary: narrate(decoded),
    details: decoded,
  };
}

export async function explainAtomicGroup(txid, network = 'mainnet') {
  const anchor = await fetchTransaction(txid, network);
  const rawTransactions = anchor.group
    ? await fetchTransactionGroup(anchor.group, network)
    : [anchor];
  const decoded = await decodeRawTransactions(rawTransactions, network);
  const insight = buildGroupInsight(decoded, txid, network);
  return { ...insight, atomic: Boolean(anchor.group) };
}

export async function explainBatch(txids, network = 'mainnet') {
  const fetched = await Promise.all(
    txids.map(async (txid) => {
      try {
        return { txid, raw: await fetchTransaction(txid, network) };
      } catch (error) {
        return { txid, error };
      }
    })
  );
  const successful = fetched.filter((item) => item.raw);
  const decoded = await decodeRawTransactions(successful.map((item) => item.raw), network);
  let decodedIndex = 0;
  const results = fetched.map((item) => {
    if (item.error) {
      return {
        ok: false,
        txid: item.txid,
        status: item.error.status ?? 500,
        error: item.error.message ?? 'Could not explain transaction.',
      };
    }
    const details = decoded[decodedIndex++];
    return {
      ok: true,
      txid: details.txid,
      network,
      summary: narrate(details),
      details,
    };
  });
  return {
    network,
    requested: txids.length,
    succeeded: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}

export async function explainAccountActivity(
  address,
  network = 'mainnet',
  limit = 25
) {
  const rawTransactions = await fetchAccountTransactions(address, network, limit);
  const decoded = await decodeRawTransactions(rawTransactions, network);
  return buildAccountInsight(address, decoded, network, limit);
}
