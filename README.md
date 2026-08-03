# tx402

Plain-English explanations of Algorand transactions, sold as a pay-per-call API
with x402 on Algorand.

Live service:

```text
https://tx402-production.up.railway.app
```

Explain one transaction, every leg of an atomic group, a batch of IDs, or recent
account activity. Responses include scaled amounts, inner transactions, asset
names, fees, timestamps, counterparties, and source-verified protocol labels.

Try the free fixed-transaction demo without a wallet:

```text
https://tx402-production.up.railway.app/demo?example=algo
```

```http
GET /explain?txid=YRSG7IKDPCK4XMKFFTFFFYMIHF6SJOMHUOIE4FFUWNLEQ4WG2ZOQ
```

Example response after payment:

```json
{
  "txid": "YRSG7IKDPCK4XMKFFTFFFYMIHF6SJOMHUOIE4FFUWNLEQ4WG2ZOQ",
  "network": "mainnet",
  "summary": "On June 16, 2019, wallet VCINCV...JPMIPM sent 1 ALGO to CRBMB5...QLXZOY. Paid 0.001 ALGO in fees.",
  "details": {
    "type": "pay",
    "sender": "VCINCVUX2DBKQ6WP63NOGPEAQAYGHGSGQX7TSH4M5LI5NBPVAGIHJPMIPM",
    "transfer": {
      "amount": "1",
      "assetId": 0,
      "unit": "ALGO"
    }
  }
}
```

Raw Algorand indexer JSON is optimized for machines doing bookkeeping: amounts
are base units, assets are numeric IDs, and notes are base64. tx402 is the
translation layer for agents and applications that need to explain a transaction
to a person.

## API

Public routes:

- `GET /` - landing page with service metadata links
- `GET /health` - process liveness
- `GET /health?deep=1&network=mainnet` - readiness check for upstream services
- `GET /discovery` - machine-readable service description and pricing metadata
- `GET /openapi.json` - OpenAPI 3.1 specification
- `GET /.well-known/agent.json` - agent marketplace manifest
- `GET /.well-known/x402` - x402 resource manifest
- `GET /llms.txt` - agent-readable documentation
- `GET /demo?example=algo|usdc` - free allowlisted Mainnet examples
- `GET /explain?txid=...&network=mainnet` - paid transaction explanation
- `GET /group?txid=...&network=mainnet` - paid atomic-group explanation
- `POST /batch` - paid batch of 1 to 10 transaction IDs
- `GET /account/activity?address=...&limit=25` - paid activity summary
- `GET /analytics` - free aggregate adoption counters

Default prices are `$0.005` for `/explain`, `$0.01` for `/group`, `$0.02` for
`/batch`, and `$0.01` for `/account/activity`. Production accepts Mainnet USDC:

- network: `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=`
- asset: `31566704`
- receiver: `6RK3U3OF2B4Q773L4KC7OVFHQGU5I74NHRZ36QN6CVF527CKXAL62YR754`

## Architecture

tx402 has a small deterministic core and a thin serving shell.

Core:

- [src/decoder.js](./src/decoder.js) converts raw Algorand indexer JSON into a
  normalized transaction object.
- [src/narrator.js](./src/narrator.js) converts that normalized object into one
  readable sentence.
- [src/insights.js](./src/insights.js) builds group and account-level summaries.
- [src/explainer.js](./src/explainer.js) resolves assets and orchestrates the
  single, group, batch, and account products.
- [src/knownApps.js](./src/knownApps.js) maps known app and asset IDs to human
  labels with a verification source for every narrated protocol claim.

Serving shell:

- [src/index.js](./src/index.js) owns HTTP routes, middleware ordering, logging,
  rate limits, health checks, and graceful shutdown.
- [src/indexer.js](./src/indexer.js) is the only module that talks to AlgoNode's
  public indexer.
- [src/payments.js](./src/payments.js) declares the x402 price and receiver, then
  delegates verification and settlement to the hosted GoPlausible facilitator.
- [src/rateLimit.js](./src/rateLimit.js) provides the in-memory per-IP limiter.
- [src/analytics.js](./src/analytics.js) keeps aggregate process-local adoption
  counters without cookies, raw wallet addresses, query strings, or IP history.

The server never stores private keys. Buyer signing happens client-side. The
resource server only advertises a price, validates payment, and settles through
the facilitator after a successful product-route response.

## Run Locally

```bash
npm install
npm start
npm test
```

Local endpoints:

```bash
curl "http://localhost:4021/health"
curl "http://localhost:4021/discovery"
curl "http://localhost:4021/explain?txid=SOME_REAL_MAINNET_TXID"
curl "http://localhost:4021/group?txid=SOME_REAL_MAINNET_TXID"
```

The app reads `.env` when present. Leave `USDC_ASSET_ID` unset unless you need a
non-standard asset; the code derives the canonical USDC asset from `NETWORK`.

## Client Examples

Read-only example client:

```bash
npm run example:client
npm run example:catalog
```

The default client prints discovery metadata and the x402 payment challenge
without spending funds. To make it pay, configure a funded buyer wallet and set
`TX402_EXAMPLE_PAY=1` plus `CONFIRM_MAINNET_PAYMENT=1`.

OpenAPI:

- [openapi.json](./openapi.json)
- `https://tx402-production.up.railway.app/openapi.json`

Agent marketplace metadata:

- `https://tx402-production.up.railway.app/.well-known/agent.json`
- `https://tx402-production.up.railway.app/.well-known/x402`
- `https://tx402-production.up.railway.app/llms.txt`

Copy-paste integrations and distribution assets:

- [Integration guide](./docs/INTEGRATIONS.md)
- [Distribution checklist](./docs/DISTRIBUTION.md)
- [GoPlausible MCP proposal](./docs/GOPLAUSIBLE_PROPOSAL.md)
- [Outreach kit](./submission/outreach-kit.md)

The paid route also declares the standard x402 Bazaar extension, including its
input/output schemas, service metadata, and example request. Facilitators can
index that metadata after a successful settlement.

MCP wrapper:

```bash
npm run mcp
```

After the public npm package is published, agents can install it without
cloning this repository:

```bash
npx tx402-mcp
```

By default the MCP wrapper is read-only and returns x402 payment requirements
for paid calls. To let it pay from a local wallet, set
`TX402_MCP_ENABLE_PAYMENTS=1` and `CONFIRM_MAINNET_PAYMENT=1`.

The six-part adoption roadmap is tracked in [PLAN.md](./PLAN.md).

## Submission Assets

- [Pitch deck](./submission/pitch-deck.md)
- [Demo video script](./submission/demo-video-script.md)

## Security Notes

- Output strings can contain untrusted on-chain data, including asset names and
  notes. JSON output is safe as JSON, but consumers rendering HTML must escape it.
- Invalid `txid` input is rejected before indexer access and before payment.
- Payment only settles after a successful response.
- All product routes, `/analytics`, `/discovery`, and deep health checks are rate-limited.
- Protocol/app names are only stated as fact when marked `verified: true`.
- Application logs omit query strings and client IP addresses.

## Status

- [x] Phase 1 - core explainer, free and local
- [x] Phase 2 - x402 payment middleware on Testnet, verified end-to-end
- [x] Phase 3 - public HTTPS deployment
- [x] Phase 4 - Mainnet payment configuration
- [x] Phase 5 - first real Mainnet settlement
- [x] Phase 6 - example client, OpenAPI spec, optional MCP wrapper

First Mainnet settlement:

- txid: `XA7HMRPUV4X2GWI4AAGUT5FKAVTNCQJ5ZMUNTVTBKG3GZMES27LA`
- amount: `0.005000` USDC

## Maintainer Notes

Implementation runbooks, deployment commands, phase evidence, and operational
cautions live in [CLAUDE.md](./CLAUDE.md).
