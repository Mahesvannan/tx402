# tx402 Integration Guide

Production base URL: `https://tx402-production.up.railway.app`

tx402 is deterministic: the serving path uses templates and verified on-chain
metadata, not an LLM. Production product routes return an x402 payment
challenge before a paid client retries the same request with payment.

## Choose a route

| Use case | Route | Default price |
|---|---|---:|
| Explain one transaction | `GET /explain` | $0.005 USDC |
| Explain an atomic group | `GET /group` | $0.01 USDC |
| Explain 1–10 transactions | `POST /batch` | $0.02 USDC |
| Summarize recent account activity | `GET /account/activity` | $0.01 USDC |

## Inspect without spending

```bash
curl "https://tx402-production.up.railway.app/discovery"
curl "https://tx402-production.up.railway.app/demo?example=algo"
curl -i "https://tx402-production.up.railway.app/explain?txid=YRSG7IKDPCK4XMKFFTFFFYMIHF6SJOMHUOIE4FFUWNLEQ4WG2ZOQ"
```

The last request returns HTTP 402 and a base64-encoded `payment-required`
header. It does not spend funds.

## JavaScript

```js
const base = 'https://tx402-production.up.railway.app';
const txids = [
  'YRSG7IKDPCK4XMKFFTFFFYMIHF6SJOMHUOIE4FFUWNLEQ4WG2ZOQ',
  '7DSJA4HZ2BKHHEDO7FHEOMQ5GXUFIXSIYXPIONGLH7HTV2LHBTUQ',
];

const response = await fetch(`${base}/batch`, {
  method: 'POST',
  headers: { accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ txids, network: 'mainnet' }),
});

if (response.status === 402) {
  const encoded = response.headers.get('payment-required');
  const challenge = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  console.log(challenge.accepts[0]);
} else {
  console.log(await response.json());
}
```

Use `@x402/fetch` with `@x402/avm` to sign and retry client-side. tx402 never
receives the buyer mnemonic or private key. The repository's
`examples/node-client.mjs` is a safe read-only example with opt-in paid mode.

## MCP agents

```bash
npx tx402-mcp
```

The MCP package exposes four tools:

- `explain_algorand_transaction`
- `explain_algorand_atomic_group`
- `explain_algorand_transaction_batch`
- `summarize_algorand_account_activity`

It is read-only by default. Explicit wallet and Mainnet confirmation variables
are required before it will spend.

## Wallets and explorers

Call `/group` when a selected transaction has a group ID. Its response includes
all outer legs, nested inner transactions, normalized transfers, aggregate
fees, and verified protocol labels with sources. Render on-chain strings as
untrusted text and HTML-escape them.

## Portfolio, tax, and compliance tools

Use `/account/activity?address=...&limit=25` for a deterministic recent-activity
summary. The output provides sent/received totals by asset, fees paid, unique
counterparty count, transaction type counts, and verified protocol interactions.
For bulk transaction records, use `/batch` and inspect each result's `ok` field.

Full contracts: `GET /openapi.json`, `GET /.well-known/agent.json`, and
`GET /.well-known/x402`.
