/**
 * Turns raw Algorand indexer JSON into a clean, normalised shape.
 *
 * Deliberately PURE and synchronous: no network, no clock, no randomness.
 * Same input always produces the same output, which makes it trivial to
 * test and means the hot path costs nothing but CPU.
 *
 * Anything requiring a lookup (asset metadata) is passed in by the caller.
 */

import { lookupApp } from './knownApps.js';

const TX_TYPE_LABELS = {
  pay: 'payment',
  axfer: 'asset transfer',
  appl: 'application call',
  acfg: 'asset configuration',
  afrz: 'asset freeze',
  keyreg: 'key registration',
  stpf: 'state proof',
  hb: 'heartbeat',
};

/** Convert base units to a human decimal string. 12300000 @ 6dp -> "12.30" */
export function formatAmount(baseUnits, decimals) {
  const n = BigInt(baseUnits ?? 0);
  const d = Number(decimals ?? 0);
  if (d === 0) return n.toString();

  const divisor = 10n ** BigInt(d);
  const whole = n / divisor;
  const frac = n % divisor;

  if (frac === 0n) return whole.toString();

  // Pad fraction, then trim trailing zeros but keep at least 2 dp for money-like assets
  let fracStr = frac.toString().padStart(d, '0').replace(/0+$/, '');
  if (d >= 2 && fracStr.length < 2) fracStr = fracStr.padEnd(2, '0');
  return `${whole}.${fracStr}`;
}

/** ABCDEF...UVWXYZ — keeps addresses readable in a sentence. */
export function shortenAddress(addr) {
  if (!addr || typeof addr !== 'string' || addr.length < 16) return addr ?? null;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

/** Decode the note field. Returns plain text when it is printable, else null. */
export function decodeNote(noteB64) {
  if (!noteB64) return null;
  try {
    const text = Buffer.from(noteB64, 'base64').toString('utf8');
    // Reject binary junk: require mostly printable characters
    // eslint-disable-next-line no-control-regex
    const printable = text.replace(/[\x00-\x08\x0E-\x1F\x7F]/g, '');
    if (printable.length === 0) return null;
    if (printable.length / text.length < 0.9) return null;
    return printable.trim() || null;
  } catch {
    return null;
  }
}

/**
 * @param {object} raw       transaction object from the indexer
 * @param {object} [ctx]
 * @param {object} [ctx.asset]  resolved asset metadata for axfer txns
 * @returns {object} normalised transaction
 */
export function decodeTransaction(raw, ctx = {}) {
  const type = raw['tx-type'];
  const roundTime = raw['round-time'];

  const base = {
    txid: raw.id ?? null,
    type,
    typeLabel: TX_TYPE_LABELS[type] ?? type,
    sender: raw.sender ?? null,
    senderShort: shortenAddress(raw.sender),
    fee: {
      baseUnits: raw.fee ?? 0,
      amount: formatAmount(raw.fee ?? 0, 6),
      unit: 'ALGO',
    },
    confirmedRound: raw['confirmed-round'] ?? null,
    timestamp: roundTime ? new Date(roundTime * 1000).toISOString() : null,
    note: decodeNote(raw.note),
    groupId: raw.group ?? null,
    isGrouped: Boolean(raw.group),
    receiver: null,
    receiverShort: null,
    transfer: null,
    application: null,
  };

  if (type === 'pay') {
    const p = raw['payment-transaction'] ?? {};
    base.receiver = p.receiver ?? null;
    base.receiverShort = shortenAddress(p.receiver);
    base.transfer = {
      baseUnits: p.amount ?? 0,
      amount: formatAmount(p.amount ?? 0, 6),
      assetId: 0,
      assetName: 'Algorand',
      unit: 'ALGO',
      closeRemainderTo: p['close-remainder-to'] ?? null,
    };
  }

  if (type === 'axfer') {
    const a = raw['asset-transfer-transaction'] ?? {};
    const asset = ctx.asset ?? {};
    const decimals = typeof asset.decimals === 'number' ? asset.decimals : 0;
    base.receiver = a.receiver ?? null;
    base.receiverShort = shortenAddress(a.receiver);
    base.transfer = {
      baseUnits: a.amount ?? 0,
      amount: formatAmount(a.amount ?? 0, decimals),
      assetId: a['asset-id'] ?? null,
      assetName: asset.name ?? `ASA ${a['asset-id']}`,
      unit: asset.unitName ?? `ASA${a['asset-id']}`,
      closeRemainderTo: a['close-to'] ?? null,
    };
    // amount 0 to self is the classic opt-in signature
    base.isOptIn = (a.amount ?? 0) === 0 && a.receiver === raw.sender;
  }

  if (type === 'appl') {
    const app = raw['application-transaction'] ?? {};
    const appId = app['application-id'] ?? null;
    const known = lookupApp(appId);
    base.application = {
      appId,
      protocol: known?.name ?? null,
      protocolCategory: known?.category ?? null,
      protocolVerified: known?.verified ?? false,
      onCompletion: app['on-completion'] ?? null,
      isCreate: appId === 0 || appId === null,
      argCount: (app['application-args'] ?? []).length,
      foreignAssets: app['foreign-assets'] ?? [],
      accounts: app.accounts ?? [],
    };
  }

  return base;
}
