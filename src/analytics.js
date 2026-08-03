/**
 * Aggregate, process-local adoption analytics.
 *
 * No query strings, IP addresses, cookies, raw payment headers, wallet
 * addresses, or payer hashes are exposed or logged. A salted one-way payer
 * hash exists only in memory to compute aggregate unique/repeat counts.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { decodeSignedTransaction } from '@x402/avm';

const startedAt = new Date().toISOString();
const salt = process.env.ANALYTICS_SALT || randomBytes(32).toString('hex');
const payerCalls = new Map();
const routeCounters = new Map();
const totals = {
  landingPageViews: 0,
  demoCalls: 0,
  paymentChallenges: 0,
  successfulPaidCalls: 0,
  failedPaidCalls: 0,
};

const PRODUCT_ROUTES = new Set(['/explain', '/group', '/batch', '/account/activity']);

function routeCounter(pathname) {
  const existing = routeCounters.get(pathname);
  if (existing) return existing;
  const created = { requests: 0, succeeded: 0, clientErrors: 0, serverErrors: 0, paymentChallenges: 0 };
  routeCounters.set(pathname, created);
  return created;
}

function paymentHeader(req) {
  return req.get('payment-signature') || req.get('x-payment') || null;
}

function payerHashFromHeader(header) {
  if (!header) return null;
  try {
    const payment = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    const group = payment?.payload?.paymentGroup;
    const paymentIndex = Number(payment?.payload?.paymentIndex ?? 0);
    if (!Array.isArray(group) || !group[paymentIndex]) return null;
    const signed = decodeSignedTransaction(group[paymentIndex]);
    const address = signed?.txn?.sender?.toString();
    if (!address) return null;
    return createHmac('sha256', salt).update(address).digest('hex');
  } catch {
    return null;
  }
}

export function analyticsMiddleware(req, res, next) {
  const pathname = req.path;
  res.on('finish', () => {
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      totals.landingPageViews++;
    }
    if (pathname === '/demo' && req.method === 'GET') totals.demoCalls++;

    if (!PRODUCT_ROUTES.has(pathname)) return;
    const counter = routeCounter(pathname);
    counter.requests++;
    if (res.statusCode === 402) {
      counter.paymentChallenges++;
      totals.paymentChallenges++;
    } else if (res.statusCode >= 500) {
      counter.serverErrors++;
    } else if (res.statusCode >= 400) {
      counter.clientErrors++;
    } else {
      counter.succeeded++;
    }

    const header = paymentHeader(req);
    if (!header) return;
    if (res.statusCode >= 200 && res.statusCode < 300) {
      totals.successfulPaidCalls++;
      const payerHash = payerHashFromHeader(header);
      if (payerHash) payerCalls.set(payerHash, (payerCalls.get(payerHash) ?? 0) + 1);
    } else if (res.statusCode !== 402) {
      totals.failedPaidCalls++;
    }
  });
  next();
}

export function analyticsSnapshot() {
  const repeatPaidCalls = [...payerCalls.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0
  );
  return {
    service: 'tx402',
    scope: 'aggregate process-local counters',
    since: startedAt,
    generatedAt: new Date().toISOString(),
    privacy: {
      storesIpAddresses: false,
      storesQueryStrings: false,
      storesWalletAddresses: false,
      usesCookies: false,
    },
    funnel: {
      ...totals,
      uniquePayers: payerCalls.size,
      repeatPaidCalls,
      demoToPaidRatio:
        totals.demoCalls > 0
          ? Number((totals.successfulPaidCalls / totals.demoCalls).toFixed(4))
          : null,
    },
    routes: Object.fromEntries(routeCounters),
    note:
      'Counters reset when the process restarts. Aggregate snapshots can be retained from deployment logs.',
  };
}

const snapshotInterval = Number(process.env.ANALYTICS_SNAPSHOT_INTERVAL_MS || 900_000);
if (Number.isFinite(snapshotInterval) && snapshotInterval >= 60_000) {
  setInterval(() => {
    console.log(JSON.stringify({ event: 'analytics_snapshot', ...analyticsSnapshot() }));
  }, snapshotInterval).unref();
}
