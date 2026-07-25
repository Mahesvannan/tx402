# tx402

Plain-English explanations of Algorand transactions, as a pay-per-call API.

Give it a transaction ID, get back a sentence a human can read — plus clean
structured fields with amounts already scaled by the right number of decimals
and asset IDs already resolved to names.

```
GET /explain?txid=PS4XSAAEHUZM5QHDGZL2YXTQFH4B4QBGWKQKPHF5J7NL3ZBHVZ5A
```

```json
{
  "txid": "PS4XSAAEHUZM5QHDGZL2YXTQFH4B4QBGWKQKPHF5J7NL3ZBHVZ5A",
  "network": "mainnet",
  "summary": "On June 1, 2024, wallet HZ57J3…MJ3MVA sent 25.50 ALGO to XOFKWH…U3DL3Q with the note \"rent payment\". Paid 0.001 ALGO in fees.",
  "details": { "type": "pay", "sender": "...", "transfer": { "amount": "25.50", "unit": "ALGO" } }
}
```

## Why this exists

Raw indexer JSON optimises for machines doing bookkeeping, not for an agent
that has to report back to a human. Amounts arrive as unscaled integers, assets
as bare numeric IDs, notes as base64, contracts as opaque application IDs.
tx402 is the translation layer.

The analogy: a bank statement line reading `POS DEBIT 4829 SQ *COFFEE HOUSE`
versus "You bought coffee at Coffee House for $4.50."

## Run it

```bash
npm install
npm start          # http://localhost:4021
npm test           # decoder/narrator fixtures + rate-limit, payment-config, and live HTTP integration tests
```

Try it:

```bash
curl "http://localhost:4021/health"
curl "http://localhost:4021/discovery"
curl "http://localhost:4021/explain?txid=SOME_REAL_MAINNET_TXID"
```

## Layout

| File | Job |
|---|---|
| `src/index.js` | HTTP routes |
| `src/indexer.js` | Talks to AlgoNode's public indexer. The only file that does network I/O. |
| `src/decoder.js` | Pure function: raw JSON → normalised fields. No network, no clock. |
| `src/narrator.js` | Pure function: normalised fields → English sentence. Templates, no LLM. |
| `src/knownApps.js` | App ID / asset ID → human name. **The file that makes this valuable.** |
| `src/payments.js` | x402 pay-per-call gate for `/explain`, via the hosted GoPlausible facilitator. No-ops (explain stays free) until `PAY_TO` is set. |
| `test/decoder.test.js` | Fixture tests for the two pure modules. |
| `test/rateLimit.test.js` | Unit tests for the rate limiter, including the R1 eviction regression. |
| `test/payments.test.js` | Regression tests for the startup config guards in `payments.js` (H1, M3, R5). |
| `test/index.test.js` | Live HTTP integration tests (free mode) — rate-limit bypass (R2), stack-trace leak (R3). |
| `test/index.paid.test.js` | Live HTTP integration tests (paid mode) — validation-before-payment ordering, touches the live facilitator. |

`decoder.js` and `narrator.js` are pure and synchronous on purpose: same input,
same output, zero marginal cost, nothing to rate-limit. "No model in the
serving path" is a selling point to agent operators.

## Roadmap

- [x] **Phase 1** — core explainer, free and local
- [x] **Phase 2** — x402 payment middleware on Testnet ([demo repo](https://github.com/algorandfoundation/x402-demo)). Code is wired in and verified live against the hosted facilitator (returns a correct HTTP 402 with signed payment requirements). Still needs a **real funded Testnet `PAY_TO` address** in `.env` and one end-to-end paid call from an actual x402 client before this phase is truly done.
- [ ] **Phase 3** — deploy to a public HTTPS host (Vercel / Railway free tier)
- [ ] **Phase 4** — flip config to Mainnet, register Bazaar discovery extension, add `tag: x402-global-challenge`
- [ ] **Phase 5** — first real Mainnet settlement; confirm it appears on the leaderboard
- [ ] **Phase 6** — example client, OpenAPI spec, optional MCP wrapper
- [ ] **Phase 7** — distribution: Algorand Discord, get indexed by the router/orchestrator endpoints
- [ ] **Phase 8** — register before **Sep 1 2026**, submit details before **Sep 29 2026**

## Enabling payments (Phase 2)

`/explain` is free until you set `PAY_TO` in `.env`. To turn payments on:

1. Copy `.env.example` to `.env`.
2. Get a Testnet Algorand address and opt it in to Testnet USDC (asset
   `10458941`) — e.g. via [Lora](https://lora.algokit.io/testnet) or the
   Pera wallet on Testnet, funded from the
   [Algorand Testnet dispenser](https://bank.testnet.algorand.network/).
3. Set `PAY_TO` to that address. Keep the same address for the whole
   competition — it is your leaderboard identity (see Phase 4 notes below).
4. Restart the server. You should see `x402 payments ENABLED for /explain`
   on boot instead of the free-fallback warning.

No private key ever touches this codebase — `src/payments.js` only declares
a price and a receiving address; the hosted facilitator
(`FACILITATOR_URL`) handles verifying and settling the actual payment.

To pay for a call yourself, use an x402-aware client (see the
[x402-demo client examples](https://github.com/algorandfoundation/x402-demo))
— a bare `curl` will just get a `402 Payment Required` with a
`PAYMENT-REQUIRED` header describing what to pay.

## Deploying (Phase 3)

If you put tx402 behind a reverse proxy (Vercel, Railway, Fly, a load balancer,
etc.), set **`TRUST_PROXY=1`** in that host's environment. Without it, every
request appears to come from the proxy's single IP, and per-IP rate limiting
(see Security notes below) collapses to one shared bucket for all your
callers — one abusive client throttles everyone. Only set this once you've
confirmed the proxy actually overwrites inbound `X-Forwarded-For` rather than
passing through whatever a client sends; otherwise a client can spoof the
header and bypass rate limiting entirely.

The server handles `SIGTERM`/`SIGINT` by draining in-flight requests before
exiting, so redeploys and restarts on hosts that send those signals (Docker,
Railway, Fly, etc.) don't cut off active calls mid-response.

## Security notes

- **Every string in the response is untrusted on-chain data.** `summary`,
  `details.transfer.assetName`, `details.transfer.unit`, and `details.note`
  are all attacker-controlled — anyone can mint an ASA named
  `<script>...</script>` or put arbitrary text in a transaction note. JSON
  encoding makes this safe as JSON; it is **not** HTML-escaped. If you render
  any of these fields as HTML, escape them yourself first.
- `/explain` is rate-limited per IP (`src/rateLimit.js`) — stricter when
  running in free/unpaid mode (no `PAY_TO` set), since that mode has no
  payment gate to throttle abuse of the underlying indexer proxy. See
  "Deploying" above for the `TRUST_PROXY` setting this depends on.
- `txid` is validated as 52 base32 characters before any network call.
- `PAY_TO` and the resolved USDC asset ID are validated at startup — the
  server refuses to boot rather than advertise a broken or wrong-network price.
- **Unverified protocol names never ship as fact.** `narrator.js` only ever
  states a protocol name (e.g. "Tinyman AMM v2") when `knownApps.js` has that
  entry flagged `verified: true`; otherwise it says the honest "smart contract
  12345". This is enforced in code, not just by convention — see "Before
  Mainnet" below for why the flag still matters.
- Payment is verified before the call runs but only **settles on a successful
  response** — a failed `/explain` call (bad txid, indexer error) does not
  charge the caller. Confirmed live: a paid request for a valid-format,
  nonexistent txid returned 404 with the buyer's on-chain balance unchanged.

## Before Mainnet: verify the app IDs

Every entry in `src/knownApps.js` is marked `verified: false`. The narrator
already refuses to name an unverified protocol (see Security notes), so this
won't produce a *wrong* label — but it does mean every `appl` call to
Tinyman/Folks Finance currently reads as "smart contract 12345" instead of by
name. Confirm each entry against a block explorer (allo.info, Pera Explorer)
and flip the flag before Mainnet to get the better narration; there's no
rush before that, since the fallback is safe by construction.

## Improving explanation quality

When you find a transaction this explains badly, paste its raw indexer JSON
into `test/decoder.test.js` as a new fixture, then fix the code until it reads
well. That loop is how the product compounds — and it is the part competitors
copying your idea cannot shortcut.

## Notes

- Public AlgoNode endpoints need no API key. Swap `MAINNET_INDEXER_URL` /
  `TESTNET_INDEXER_URL` if you hit limits.
- Grouped transactions (`group` field set) usually mean a swap or multi-step
  DeFi action. Explaining the *whole group* rather than one leg is the single
  biggest quality upgrade available — a natural v2.
