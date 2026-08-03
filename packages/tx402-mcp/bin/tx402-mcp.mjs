#!/usr/bin/env node
/**
 * MCP wrapper for tx402.
 *
 * Read-only mode is the safe default: a paid request returns its x402
 * requirements without spending. Explicit environment variables enable
 * client-side signing from a local Algorand wallet file.
 */

import fs from 'node:fs';
import dotenv from 'dotenv';
import algosdk from 'algosdk';
import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactAvmScheme } from '@x402/avm/exact/client';
import {
  ALGORAND_MAINNET_CAIP2,
  getNetworkFromCaip2,
  toClientAvmSigner,
} from '@x402/avm';

dotenv.config({ quiet: true });

const SERVER = (
  process.env.TX402_URL || 'https://tx402-production.up.railway.app'
).replace(/\/+$/, '');
const NETWORK = process.env.NETWORK || ALGORAND_MAINNET_CAIP2;
const RESOLVED_NETWORK = getNetworkFromCaip2(NETWORK);
const ENABLE_PAYMENTS = process.env.TX402_MCP_ENABLE_PAYMENTS === '1';
const TXID_PATTERN = /^[A-Z2-7]{52}$/;

function decodePaymentChallenge(header) {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function createFetch() {
  if (!ENABLE_PAYMENTS) return fetch;

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

  return wrapFetchWithPayment(fetch, client);
}

const tx402Fetch = createFetch();
const server = new McpServer({
  name: 'tx402',
  version: '0.2.0',
});

async function asToolResponse(res) {
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (res.status === 402) {
    const challenge = decodePaymentChallenge(res.headers.get('payment-required'));
    return {
      isError: true,
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'x402 payment required',
          enablePayments: 'Set TX402_MCP_ENABLE_PAYMENTS=1 with a funded buyer wallet.',
          challenge: challenge?.accepts?.[0] || challenge,
        }, null, 2),
      }],
    };
  }
  if (!res.ok) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
  }
  return {
    content: [{ type: 'text', text: body.summary || JSON.stringify(body, null, 2) }],
    structuredContent: body,
  };
}

server.registerTool(
  'explain_algorand_transaction',
  {
    title: 'Explain Algorand transaction',
    description:
      'Explain one Algorand transaction in plain English using tx402. Returns payment requirements if the endpoint requires x402 payment and payments are not enabled in this MCP wrapper.',
    inputSchema: {
      txid: z.string().regex(TXID_PATTERN, 'expected 52 base32 characters'),
      network: z.enum(['mainnet', 'testnet']).default('mainnet'),
    },
  },
  async ({ txid, network }) => {
    const url = `${SERVER}/explain?txid=${encodeURIComponent(txid)}&network=${encodeURIComponent(network)}`;
    const res = await tx402Fetch(url, { headers: { accept: 'application/json' } });
    return asToolResponse(res);
  }
);

server.registerTool(
  'explain_algorand_atomic_group',
  {
    title: 'Explain Algorand atomic group',
    description: 'Explain every outer and inner transaction in the atomic group containing a transaction ID.',
    inputSchema: {
      txid: z.string().regex(TXID_PATTERN, 'expected 52 base32 characters'),
      network: z.enum(['mainnet', 'testnet']).default('mainnet'),
    },
  },
  async ({ txid, network }) => {
    const url = `${SERVER}/group?txid=${encodeURIComponent(txid)}&network=${encodeURIComponent(network)}`;
    return asToolResponse(await tx402Fetch(url, { headers: { accept: 'application/json' } }));
  }
);

server.registerTool(
  'explain_algorand_transaction_batch',
  {
    title: 'Explain Algorand transaction batch',
    description: 'Explain 1 to 10 Algorand transaction IDs in one request, with per-item results.',
    inputSchema: {
      txids: z.array(z.string().regex(TXID_PATTERN, 'expected 52 base32 characters')).min(1).max(10),
      network: z.enum(['mainnet', 'testnet']).default('mainnet'),
    },
  },
  async ({ txids, network }) => asToolResponse(await tx402Fetch(`${SERVER}/batch`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ txids, network }),
  }))
);

server.registerTool(
  'summarize_algorand_account_activity',
  {
    title: 'Summarize Algorand account activity',
    description: 'Summarize recent asset flows, fees, counterparties, and verified protocol interactions for an Algorand account.',
    inputSchema: {
      address: z.string().refine((value) => algosdk.isValidAddress(value), 'invalid Algorand address'),
      network: z.enum(['mainnet', 'testnet']).default('mainnet'),
      limit: z.number().int().min(1).max(50).default(25),
    },
  },
  async ({ address, network, limit }) => {
    const url = `${SERVER}/account/activity?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}&limit=${limit}`;
    return asToolResponse(await tx402Fetch(url, { headers: { accept: 'application/json' } }));
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`tx402 MCP server connected to ${SERVER} (${RESOLVED_NETWORK})`);
