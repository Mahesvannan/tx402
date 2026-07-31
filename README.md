# tx402

Plain-English explanations of Algorand transactions, sold as a pay-per-call API
with x402 on Algorand.

Live service:

```text
https://tx402-production.up.railway.app
```

Give it a transaction ID, get back a human-readable sentence plus structured
fields with scaled amounts, asset names, decoded notes, fees, timestamps, and
counterparties.

```http
GET /explain?txid=7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ
```

Example response after payment:

```json
{
  "txid": "7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ",
  "network": "mainnet",
  "summary": "On June 15, 2019, wallet I3345F...EUBEGU sent 0.10 ALGO to ALGORA...N5DNAU. Paid 0.001 ALGO in fees.",
  "details": {
    "type": "pay",
    "sender": "I3345FUQQ2GRBHFZQPLYQQX5HJMMRZMABCHRLWV6RCJYC6OO4MOLEUBEGU",
    "transfer": {
      "amount": "0.10",
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

- `GET /health` - process liveness
- `GET /health?deep=1&network=mainnet` - readiness check for upstream services
- `GET /discovery` - machine-readable service description and pricing metadata
- `GET /explain?txid=...&network=mainnet` - paid transaction explanation

`/explain` is priced at `$0.005` per call. Production currently accepts Mainnet
USDC:

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
- [src/knownApps.js](./src/knownApps.js) maps known app and asset IDs to human
  labels, while avoiding unverified protocol claims.

Serving shell:

- [src/index.js](./src/index.js) owns HTTP routes, middleware ordering, logging,
  rate limits, health checks, and graceful shutdown.
- [src/indexer.js](./src/indexer.js) is the only module that talks to AlgoNode's
  public indexer.
- [src/payments.js](./src/payments.js) declares the x402 price and receiver, then
  delegates verification and settlement to the hosted GoPlausible facilitator.
- [src/rateLimit.js](./src/rateLimit.js) provides the in-memory per-IP limiter.

The server never stores private keys. Buyer signing happens client-side. The
resource server only advertises a price, validates payment, and settles through
the facilitator after a successful `/explain` response.

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
```

The app reads `.env` when present. Leave `USDC_ASSET_ID` unset unless you need a
non-standard asset; the code derives the canonical USDC asset from `NETWORK`.

## Security Notes

- Output strings can contain untrusted on-chain data, including asset names and
  notes. JSON output is safe as JSON, but consumers rendering HTML must escape it.
- Invalid `txid` input is rejected before indexer access and before payment.
- Payment only settles after a successful response.
- `/explain`, `/discovery`, and deep health checks are rate-limited.
- Protocol/app names are only stated as fact when marked `verified: true`.

## Status

- [x] Phase 1 - core explainer, free and local
- [x] Phase 2 - x402 payment middleware on Testnet, verified end-to-end
- [x] Phase 3 - public HTTPS deployment
- [x] Phase 4 - Mainnet payment configuration
- [x] Phase 5 - first real Mainnet settlement
- [ ] Phase 6 - example client, OpenAPI spec, optional MCP wrapper

First Mainnet settlement:

- txid: `XA7HMRPUV4X2GWI4AAGUT5FKAVTNCQJ5ZMUNTVTBKG3GZMES27LA`
- amount: `0.005000` USDC

## Maintainer Notes

Implementation runbooks, deployment commands, phase evidence, and operational
cautions live in [CLAUDE.md](./CLAUDE.md).
