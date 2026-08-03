# tx402 Maintainer Notes

Guidance for humans and coding agents working in this repository.

README.md is the public project document. Keep detailed implementation notes,
phase runbooks, deployment evidence, and operational cautions here.

## Current Production

Railway project:

- project: `tx402`
- url: `https://tx402-production.up.railway.app`
- service: `tx402`
- environment: `production`
- region: `sfo`

Live payment configuration:

- network: Mainnet
- `NETWORK=algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=`
- `USDC_ASSET_ID=31566704`
- `PAY_TO=6RK3U3OF2B4Q773L4KC7OVFHQGU5I74NHRZ36QN6CVF527CKXAL62YR754`
- `FACILITATOR_URL=https://facilitator.goplausible.xyz`
- `TRUST_PROXY=1`

Do not commit `.env` or any wallet file. `*.local.json` is intentionally
gitignored.

## File Layout

| File | Job |
|---|---|
| `src/index.js` | HTTP routes, middleware ordering, logging, health checks, graceful shutdown |
| `src/indexer.js` | AlgoNode indexer client and deep-health indexer probe |
| `src/decoder.js` | Pure raw transaction decoder |
| `src/narrator.js` | Pure plain-English narrator |
| `src/knownApps.js` | App and asset label cache; protocol labels must be verified before use |
| `src/payments.js` | x402 payment gate configuration; no private keys |
| `src/rateLimit.js` | In-memory fixed-window per-IP limiter |
| `public/logo.svg` / `public/favicon.svg` | Public marketplace/landing-page visual assets |
| `scripts/smoke-phase3.mjs` | Public route deployment smoke test |
| `scripts/check-phase4-mainnet.mjs` | Mainnet receiver preflight |
| `scripts/check-phase5-buyer.mjs` | Mainnet buyer balance and opt-in preflight |
| `scripts/pay-and-explain.mjs` | x402 buyer client for Testnet or confirmed Mainnet payment |
| `examples/node-client.mjs` | Public client example; read-only by default, optional paid mode |
| `mcp/tx402-mcp.mjs` | MCP stdio wrapper; read-only by default, optional paid mode |
| `openapi.json` | OpenAPI 3.1 document, also served at `/openapi.json` |
| `test/*.test.js` | No runner dependency; each file is a standalone Node process |
| `Dockerfile` / `Procfile` / `.dockerignore` | Persistent-process deployment artifacts |
| `Review.md` | Gitignored audit/review history; read before assuming prior checks were not done |

## Invariants

- Keep `src/decoder.js` and `src/narrator.js` pure and synchronous. They should
  not do network I/O or depend on wall-clock time beyond passed input.
- `src/indexer.js` should remain the only module that talks to the Algorand
  indexer.
- The server never handles private keys. Buyer signing belongs in local client
  scripts or external clients.
- Validate request shape before the payment gate. A request that will fail with
  `400` must not require payment first.
- Payment settles only after a successful `/explain` response.
- Do not trust `X-Forwarded-For` unless `TRUST_PROXY=1` is set behind a proxy
  that overwrites inbound forwarding headers.
- Do not horizontally scale past one instance without replacing the in-memory
  limiter with a shared-store limiter.

## Running And Testing

```bash
npm install
npm start
npm test
```

`npm test` chains five standalone Node scripts. Some tests touch live external
services: AlgoNode and the GoPlausible facilitator. Paid-mode HTTP tests run in
a separate process because `src/index.js` imports `src/payments.js` through a
normal module specifier, and Node module caching pins env-derived payment config
for the process lifetime.

Useful checks:

```bash
npm run smoke
npm run example:client
npm run phase4:check
npm run phase5:check
```

For a deployed host:

```bash
TX402_URL=https://tx402-production.up.railway.app npm run smoke
```

## Deployment Runbook

Use a persistent-process host only: Railway, Fly, Render, or any Docker host.
Do not use Vercel/serverless for the current app shape.

Reason: the app calls `app.listen`, uses an in-memory per-IP limiter, and relies
on process shutdown signals for graceful deploy drains. Serverless support would
require an Express handler adapter and a shared limiter such as Redis.

Railway setup used for Phase 3:

```bash
railway up --new --name tx402 --detach --message "Phase 3 public Testnet deploy"
railway domain --json
railway service source connect --repo Mahesvannan/tx402 --branch master --service tx402
```

Runtime variables for production:

```env
FACILITATOR_URL=https://facilitator.goplausible.xyz
NETWORK=algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=
PAY_TO=6RK3U3OF2B4Q773L4KC7OVFHQGU5I74NHRZ36QN6CVF527CKXAL62YR754
USDC_ASSET_ID=31566704
TRUST_PROXY=1
```

Do not set `PORT` on Railway. Railway provides it and `src/index.js` reads
`process.env.PORT`.

Smoke test after deployment:

```bash
TX402_URL=https://tx402-production.up.railway.app DEEP_HEALTH_NETWORK=mainnet npm run smoke
```

Inspect the live x402 challenge:

```bash
node -e "const res=await fetch('https://tx402-production.up.railway.app/explain?txid=7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ'); const h=res.headers.get('payment-required'); const body=JSON.parse(Buffer.from(h,'base64').toString('utf8')); console.log(body.accepts?.[0]);"
```

Expected Mainnet fields:

- `network=algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=`
- `asset=31566704`
- `payTo=6RK3U3OF2B4Q773L4KC7OVFHQGU5I74NHRZ36QN6CVF527CKXAL62YR754`
- `amount=5000`

## Phase 4 Runbook

Before switching any live service to Mainnet, verify the receiver:

```bash
MAINNET_PAY_TO=<mainnet-usdc-opted-in-address> npm run phase4:check
```

The receiver must exist on Mainnet and be opted into Mainnet USDC asset
`31566704`. Only after that passes, set Railway variables:

```bash
railway variable set "NETWORK=algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=" --skip-deploys
railway variable set "PAY_TO=<mainnet-usdc-opted-in-address>" --skip-deploys
railway variable set "USDC_ASSET_ID=31566704" --skip-deploys
railway up --detach --message "Phase 4 Mainnet config"
```

Phase 4 was completed with receiver:

```text
6RK3U3OF2B4Q773L4KC7OVFHQGU5I74NHRZ36QN6CVF527CKXAL62YR754
```

## Phase 5 Runbook

Phase 5 spends real Mainnet USDC from a buyer wallet. Never paste mnemonics into
chat or commit them.

Public buyer address preflight:

```bash
BUYER_ADDRESS=<buyer-address> npm run phase5:check
```

Local signing-wallet preflight:

```bash
npm run phase5:check
```

The local file must be:

```text
.mainnet-buyer-wallet.local.json
```

Shape:

```json
{ "mnemonic": "..." }
```

Actual settlement requires an explicit real-money confirmation flag:

```bash
TX402_URL=https://tx402-production.up.railway.app CONFIRM_MAINNET_PAYMENT=1 npm run phase5:settle
```

First Mainnet settlement evidence:

- buyer: `YSH3C6Q6QZ3JJN62SMFG3MOHOVOYSYSCQD4GFURYFPCGUFRJ2XF25GMRPY`
- receiver: `6RK3U3OF2B4Q773L4KC7OVFHQGU5I74NHRZ36QN6CVF527CKXAL62YR754`
- asset: Mainnet USDC `31566704`
- amount: `0.005000` USDC
- txid: `XA7HMRPUV4X2GWI4AAGUT5FKAVTNCQJ5ZMUNTVTBKG3GZMES27LA`
- confirmed round: `63621097`

Balance proof:

- buyer: `1.000000 -> 0.995000` USDC
- receiver: `3.350000 -> 3.355000` USDC

## Phase 6 Runbook

Phase 6 artifacts:

- `openapi.json`
- `GET /openapi.json`
- `GET /`
- `GET /.well-known/agent.json`
- `GET /.well-known/x402`
- `GET /llms.txt`
- `examples/node-client.mjs`
- `mcp/tx402-mcp.mjs`

The well-known routes and `llms.txt` are intentionally public and unauthenticated.
They exist so x402 dashboards, agent marketplaces, and coding agents can identify
the product, paid endpoint, pricing, network, facilitator, OpenAPI schema, and
operator contact without scraping README text.

The example client is read-only by default:

```bash
npm run example:client
```

Paid example mode requires:

```bash
TX402_EXAMPLE_PAY=1 CONFIRM_MAINNET_PAYMENT=1 npm run example:client
```

The MCP wrapper runs over stdio:

```bash
npm run mcp
```

It is read-only by default. Paid MCP mode requires:

```bash
TX402_MCP_ENABLE_PAYMENTS=1 CONFIRM_MAINNET_PAYMENT=1 npm run mcp
```

## Monitoring

Plain `/health` is liveness only. It does not prove `/explain` can reach the
indexer or facilitator.

Use:

```http
GET /health?deep=1&network=mainnet
```

The deep route is rate-limited and cached for 15 seconds to avoid turning
monitoring traffic into an upstream amplifier.

## Security Model

- `summary`, `assetName`, `unit`, and `note` may contain attacker-controlled
  on-chain strings. HTML consumers must escape them.
- `/explain` is rate-limited per IP, with a stricter limit in free mode.
- `txid` format validation happens before payment.
- `PAY_TO` and `USDC_ASSET_ID` are startup-validated.
- Wrong-network canonical USDC IDs cause startup failure.
- Unverified protocol mappings are not narrated as fact.

## Before Expanding Further

- Verify app IDs in `src/knownApps.js` before flipping any `verified` flag.
- If traffic grows, add a shared-store limiter before increasing replicas.
- If indexer rate limits become visible, set `MAINNET_INDEXER_URL` to a paid
  provider.
- The biggest product upgrade is group-level transaction explanation instead of
  explaining only one transaction leg.

## Review History

`Review.md` is gitignored and contains the detailed audit trail across review
passes. Read it before assuming an issue has not been checked.
