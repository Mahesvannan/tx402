import { formatAmount, shortenAddress } from './decoder.js';
import { narrate } from './narrator.js';

export function flattenTransactions(transactions) {
  const flattened = [];
  function visit(tx) {
    flattened.push(tx);
    for (const inner of tx.innerTransactions ?? []) visit(inner);
  }
  for (const tx of transactions) visit(tx);
  return flattened;
}

function countByType(transactions) {
  const counts = {};
  for (const tx of transactions) counts[tx.typeLabel] = (counts[tx.typeLabel] ?? 0) + 1;
  return counts;
}

function verifiedProtocols(transactions) {
  const protocols = new Map();
  for (const tx of transactions) {
    const application = tx.application;
    if (!application?.protocolVerified) continue;
    const key = `${application.protocolName}:${application.appId}`;
    protocols.set(key, {
      protocol: application.protocolName,
      application: application.protocol,
      component: application.component,
      category: application.protocolCategory,
      appId: application.appId,
      source: application.protocolSource,
    });
  }
  return [...protocols.values()];
}

function totalFees(transactions) {
  const baseUnits = transactions.reduce((sum, tx) => sum + BigInt(tx.fee?.baseUnits ?? 0), 0n);
  return {
    baseUnits: baseUnits.toString(),
    amount: formatAmount(baseUnits, 6),
    unit: 'ALGO',
  };
}

export function buildGroupInsight(outerTransactions, anchorTxid, network) {
  const allTransactions = flattenTransactions(outerTransactions);
  const protocols = verifiedProtocols(allTransactions);
  const transfers = allTransactions
    .filter((tx) => tx.transfer && !tx.isOptIn)
    .map((tx) => ({
      txid: tx.txid,
      sender: tx.sender,
      receiver: tx.receiver,
      amount: tx.transfer.amount,
      unit: tx.transfer.unit,
      assetId: tx.transfer.assetId,
    }));
  const appCalls = allTransactions.filter((tx) => tx.type === 'appl').length;
  const innerCount = allTransactions.length - outerTransactions.length;
  const protocolText = [...new Set(protocols.map((item) => item.protocol))].join(', ');
  const parts = [
    `${outerTransactions.length}-transaction atomic group`,
    `${transfers.length} transfer${transfers.length === 1 ? '' : 's'}`,
    `${appCalls} application call${appCalls === 1 ? '' : 's'}`,
  ];
  if (innerCount) parts.push(`${innerCount} inner transaction${innerCount === 1 ? '' : 's'}`);

  return {
    anchorTxid,
    network,
    groupId: outerTransactions[0]?.groupId ?? null,
    summary: `${parts.join(', ')}${protocolText ? ` involving ${protocolText}` : ''}. Total fees: ${totalFees(allTransactions).amount} ALGO.`,
    transactionCount: outerTransactions.length,
    innerTransactionCount: innerCount,
    typeCounts: countByType(allTransactions),
    totalFees: totalFees(allTransactions),
    protocols,
    transfers,
    transactions: outerTransactions.map((tx) => ({ summary: narrate(tx), details: tx })),
  };
}

function addTransfer(aggregate, transfer) {
  const key = String(transfer.assetId);
  const current = aggregate.get(key) ?? {
    assetId: transfer.assetId,
    assetName: transfer.assetName,
    unit: transfer.unit,
    decimals: transfer.decimals ?? (transfer.assetId === 0 ? 6 : 0),
    baseUnits: 0n,
  };
  current.baseUnits += BigInt(transfer.baseUnits ?? 0);
  aggregate.set(key, current);
}

function serializeTotals(aggregate) {
  return [...aggregate.values()].map((item) => ({
    assetId: item.assetId,
    assetName: item.assetName,
    unit: item.unit,
    baseUnits: item.baseUnits.toString(),
    amount: formatAmount(item.baseUnits, item.decimals),
  }));
}

export function buildAccountInsight(address, outerTransactions, network, requestedLimit) {
  const allTransactions = flattenTransactions(outerTransactions);
  const sent = new Map();
  const received = new Map();
  const counterparties = new Set();

  for (const tx of allTransactions) {
    if (!tx.transfer || tx.isOptIn) continue;
    if (tx.sender === address) {
      addTransfer(sent, tx.transfer);
      if (tx.receiver && tx.receiver !== address) counterparties.add(tx.receiver);
    }
    if (tx.receiver === address) {
      addTransfer(received, tx.transfer);
      if (tx.sender && tx.sender !== address) counterparties.add(tx.sender);
    }
  }

  const protocols = verifiedProtocols(allTransactions);
  const timestamps = outerTransactions.map((tx) => tx.timestamp).filter(Boolean).sort();
  const protocolText = [...new Set(protocols.map((item) => item.protocol))].join(', ');
  const summary =
    `Analyzed ${outerTransactions.length} recent transaction${outerTransactions.length === 1 ? '' : 's'} for wallet ${shortenAddress(address)}: ` +
    `${serializeTotals(sent).length} sent asset type${serializeTotals(sent).length === 1 ? '' : 's'}, ` +
    `${serializeTotals(received).length} received asset type${serializeTotals(received).length === 1 ? '' : 's'}` +
    `${protocolText ? `, with verified interactions involving ${protocolText}` : ''}.`;

  return {
    address,
    network,
    requestedLimit,
    transactionCount: outerTransactions.length,
    innerTransactionCount: allTransactions.length - outerTransactions.length,
    summary,
    period: {
      from: timestamps[0] ?? null,
      to: timestamps.at(-1) ?? null,
    },
    typeCounts: countByType(allTransactions),
    totals: {
      sent: serializeTotals(sent),
      received: serializeTotals(received),
      feesPaid: totalFees(allTransactions.filter((tx) => tx.sender === address)),
    },
    uniqueCounterparties: counterparties.size,
    protocols,
    recentTransactions: outerTransactions.map((tx) => ({
      txid: tx.txid,
      summary: narrate(tx),
      details: tx,
    })),
  };
}
