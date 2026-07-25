/**
 * Turns a decoded transaction into a plain-English sentence.
 *
 * Deliberately template-driven rather than LLM-driven:
 *   - zero marginal cost per call, so your margin is the whole price
 *   - millisecond latency
 *   - deterministic: the same txid always yields the same words
 *   - nothing to rate-limit, nothing to key-rotate, nothing to hallucinate
 *
 * "No model in the serving path" is a selling point to agent operators,
 * not a limitation. If you later want a richer prose tier, add it as a
 * separate, more expensive route — never as a dependency of this one.
 */

import { shortenAddress } from './decoder.js';

const DATE_OPTS = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
};

function humanDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', DATE_OPTS);
}

/**
 * @param {object} tx decoded transaction from decoder.js
 * @returns {string} one-sentence summary
 */
export function narrate(tx) {
  const when = humanDate(tx.timestamp);
  const prefix = when ? `On ${when}, ` : '';
  const fee = `${tx.fee.amount} ALGO in fees`;
  const from = tx.senderShort ?? 'an unknown account';

  switch (tx.type) {
    case 'pay': {
      const t = tx.transfer;
      if (t.closeRemainderTo) {
        return `${prefix}wallet ${from} sent ${t.amount} ALGO to ${tx.receiverShort} and closed its account, ` +
          `sending the remaining balance to ${shortenAddress(t.closeRemainderTo)}. Paid ${fee}.`;
      }
      if (t.baseUnits === 0) {
        return `${prefix}wallet ${from} sent a 0 ALGO transaction to ${tx.receiverShort}` +
          `${tx.note ? ` with the note "${tx.note}"` : ''}. Paid ${fee}.`;
      }
      return `${prefix}wallet ${from} sent ${t.amount} ALGO to ${tx.receiverShort}` +
        `${tx.note ? ` with the note "${tx.note}"` : ''}. Paid ${fee}.`;
    }

    case 'axfer': {
      const t = tx.transfer;
      if (tx.isOptIn) {
        return `${prefix}wallet ${from} opted in to ${t.assetName} (asset ${t.assetId}), ` +
          `which is required before it can receive that asset. Paid ${fee}.`;
      }
      if (t.closeRemainderTo) {
        return `${prefix}wallet ${from} sent ${t.amount} ${t.unit} to ${tx.receiverShort} ` +
          `and closed out its ${t.assetName} position. Paid ${fee}.`;
      }
      return `${prefix}wallet ${from} sent ${t.amount} ${t.unit} to ${tx.receiverShort}` +
        `${tx.note ? ` with the note "${tx.note}"` : ''}. Paid ${fee}.`;
    }

    case 'appl': {
      const a = tx.application;
      if (a.isCreate) {
        return `${prefix}wallet ${from} deployed a new smart contract. Paid ${fee}.`;
      }
      // Only ever name a protocol when knownApps.js has it flagged verified —
      // an unverified/placeholder mapping must never be stated as fact. This
      // check lives here (not just in the data) so the safety is structural:
      // forgetting to flip a flag degrades to an honest "smart contract N",
      // never a wrong name presented as truth.
      const target = a.protocol && a.protocolVerified
        ? `${a.protocol} (app ${a.appId})`
        : `smart contract ${a.appId}`;
      const action = describeOnCompletion(a.onCompletion);
      const grouped = tx.isGrouped
        ? ' This call was part of a grouped transaction, so it likely moved funds alongside other steps.'
        : '';
      return `${prefix}wallet ${from} ${action} ${target}.${grouped} Paid ${fee}.`;
    }

    case 'acfg':
      return `${prefix}wallet ${from} created or reconfigured an Algorand asset. Paid ${fee}.`;

    case 'afrz':
      return `${prefix}wallet ${from} froze or unfroze an asset holding. Paid ${fee}.`;

    case 'keyreg':
      return `${prefix}wallet ${from} updated its consensus participation keys ` +
        `(going online or offline for staking). Paid ${fee}.`;

    default:
      return `${prefix}wallet ${from} submitted a ${tx.typeLabel} transaction. Paid ${fee}.`;
  }
}

function describeOnCompletion(oc) {
  switch (oc) {
    case 'optin': return 'opted in to';
    case 'closeout': return 'closed out of';
    case 'clear': return 'cleared its state from';
    case 'update': return 'updated the code of';
    case 'delete': return 'deleted';
    case 'noop':
    default: return 'called';
  }
}
