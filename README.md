# tx402

Plain-English explanations of Algorand transactions, as a pay-per-call API.

Give it a transaction ID, get back a sentence a human can read - plus clean
structured fields with amounts already scaled by the right number of decimals
and asset IDs already resolved to names.

```
GET /explain?txid=PS4XSAAEHUZM5QHDGZL2YXTQFH4B4QBGWKQKPHF5J7NL3ZBHVZ5A
```

```json
{
  "txid": "PS4XSAAEHUZM5QHDGZL2YXTQFH4B4QBGWKQKPHF5J7NL3ZBHVZ5A",
  "network": "mainnet",
  "summary": "On June 1, 2024, wallet HZ57J3...MJ3MVA sent 25.50 ALGO to XOFKWH...U3DL3Q with the note \"rent payment\". Paid 0.001 ALGO in fees.",
  "details": { "type": "pay", "sender": "...", "transfer": { "amount": "25.50", "unit": "ALGO" } }
}
```

Raw indexer JSON optimises for machines doing bookkeeping, not for an agent
reporting back to a human - amounts as unscaled integers, assets as bare
numeric IDs, notes as base64. tx402 is the translation layer.

## Run it

```bash
npm install
npm start          # http://localhost:4021
npm test
```

```bash
curl "http://localhost:4021/health"
curl "http://localhost:4021/discovery"
curl "http://localhost:4021/explain?txid=SOME_REAL_MAINNET_TXID"
```

## Enabling payments

`/explain` is free until you set `PAY_TO` in `.env`:

1. Copy `.env.example` to `.env`.
2. Set `PAY_TO` to a Testnet Algorand address opted in to Testnet USDC.
3. Restart - boot log should show payments enabled instead of the free-mode warning.

No private key ever touches this codebase; a hosted facilitator handles
verifying and settling payment. Full setup, deploy, and security details are
in [`CLAUDE.md`](./CLAUDE.md).

## Roadmap

- [x] Phase 1 - core explainer, free and local
- [x] Phase 2 - x402 payment middleware on Testnet, verified end-to-end
- [x] Phase 3 - deploy to a public HTTPS host (persistent-process only - see `CLAUDE.md`)
- [x] Phase 4 - flip config to Mainnet
- [x] Phase 5 - first real Mainnet settlement
- [ ] Phase 6 - example client, OpenAPI spec, optional MCP wrapper

## Deploying (Phase 3)

Use Railway for the first public deploy. It matches the current app shape:
one long-lived Node process, root `Dockerfile`, environment variables, and a
public HTTPS domain.

Current Phase 3 deployment:

- `https://tx402-production.up.railway.app`
- Live payment network: Mainnet
- Mainnet USDC asset: `31566704`

Render, Fly, or any Docker host are valid fallbacks. Do not use Vercel or
other serverless/FaaS platforms for the current app shape.

For a Phase 3 deploy, keep payments on Testnet and set these environment
variables on the host:

- `FACILITATOR_URL`
- `NETWORK`
- `PAY_TO`
- `TRUST_PROXY=1` when running behind a trusted reverse proxy/load balancer

Do not set `PORT` on Railway; let Railway provide it. The app reads
`process.env.PORT` automatically.

The repo already includes both a [`Dockerfile`](./Dockerfile) and
[`Procfile`](./Procfile). After deploy, smoke-test:

- `GET /health`
- `GET /health?deep=1`
- `GET /discovery`
- one paid `GET /explain?txid=...` call

Convenience commands:

- `npm run smoke` for the public-route Phase 3 checks
- `npm run smoke:paid` for a real paid `/explain` call

Both support `TX402_URL=...` for hitting the deployed host instead of localhost.

## Mainnet preflight (Phase 4)

Before switching the Railway service to Mainnet, verify the receiver address:

```bash
MAINNET_PAY_TO=YOUR_MAINNET_ADDRESS_OPTED_IN_TO_USDC npm run phase4:check
```

The current Testnet receiver is not automatically Mainnet-ready. The Mainnet
receiver must exist on Mainnet and be opted into USDC asset `31566704`.

## First Mainnet settlement (Phase 5)

Create a local gitignored buyer wallet file:

```json
{ "mnemonic": "YOUR MAINNET BUYER MNEMONIC" }
```

Save it as `.mainnet-buyer-wallet.local.json`. The buyer wallet must hold real
Mainnet ALGO for fees/minimum balance and at least `0.005` Mainnet USDC.

To check a public buyer address before handling any private key:

```bash
BUYER_ADDRESS=YOUR_MAINNET_BUYER_ADDRESS npm run phase5:check
```

Before paying with a local wallet file:

```bash
npm run phase5:check
```

To make the first real Mainnet payment:

```bash
TX402_URL=https://tx402-production.up.railway.app CONFIRM_MAINNET_PAYMENT=1 npm run phase5:settle
```

First Mainnet settlement:

- txid: `XA7HMRPUV4X2GWI4AAGUT5FKAVTNCQJ5ZMUNTVTBKG3GZMES27LA`
- amount: `0.005000` USDC

## Learn more

See [`CLAUDE.md`](./CLAUDE.md) for architecture, the full file layout,
deploying, scaling, monitoring, and the security model.
