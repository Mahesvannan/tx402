Guidance for anyone (human or Claude) working in this repository.

## What this is

tx402 explains Algorand transactions in plain English and sells the answer
per call via the x402 protocol. Two halves:

- **Pure core** — `src/decoder.js` (raw indexer JSON → normalised fields) and
  `src/narrator.js` (normalised fields → one English sentence). Both are
  synchronous and total: no network, no clock reads beyond what's passed in,
  never throw. Keep it that way — it's what makes the service deterministic
  and cheap to serve.
- **Serving shell** — `src/index.js` (HTTP routes), `src/indexer.js` (the only
  file that talks to the network — AlgoNode), `src/payments.js` (the x402
  pay-per-call gate via the hosted GoPlausible facilitator; never touches a
  private key), `src/rateLimit.js` (dependency-free per-IP limiter),
  `src/knownApps.js` (app/asset ID → human name — the file that makes the
  narration actually valuable).

## Layout

| File | Job |
|---|---|
| `src/index.js` | HTTP routes, middleware ordering, graceful shutdown |
| `src/indexer.js` | Talks to AlgoNode's public indexer; also exposes `checkIndexerHealth` for the deep health check |
| `src/decoder.js` | Pure: raw JSON → normalised fields |
| `src/narrator.js` | Pure: normalised fields → English sentence |
| `src/knownApps.js` | App ID / asset ID → human name |
| `src/payments.js` | x402 pay-per-call gate for `/explain`; no-ops (stays free) until `PAY_TO` is set |
| `src/rateLimit.js` | In-memory per-IP fixed-window limiter |
| `test/decoder.test.js` | Fixture tests for the two pure modules |
| `test/rateLimit.test.js` | Rate limiter unit tests, incl. the eviction-sweep regression |
| `test/payments.test.js` | Startup config guard regressions in `payments.js` |
| `test/index.test.js` | Live HTTP integration tests, free mode |
| `test/index.paid.test.js` | Live HTTP integration tests, paid mode — touches the live facilitator |
| `Dockerfile` / `Procfile` / `.dockerignore` | Container build for a persistent-process deploy |
| `Review.md` | Running review/audit log across every pass on this project. **Gitignored on purpose** — internal only, never pushed. Read it for the full history of what's been checked and why; it is the authoritative record, not this file. |

## Running & testing

```bash
npm install
npm start          # http://localhost:4021
npm test
```

`npm test` chains 5 files, each a separate `node` process (no test runner
dependency). Several of them make **real** outbound calls (AlgoNode, the
GoPlausible facilitator) rather than mocking the network — that's
deliberate; every fix in this project has been verified live, not just
read-reviewed, and the tests follow the same standard. Paid-mode HTTP tests
are split into their own process (`index.paid.test.js`) because
`src/index.js` imports `src/payments.js` via a plain, non-cache-busted
specifier — correct for production, but it means Node's module cache pins
whichever config loaded first for the lifetime of one process, so free/paid
server instances need separate processes to get genuinely independent
config.

## Enabling payments

`/explain` is free until `PAY_TO` is set in `.env`:

1. Copy `.env.example` to `.env`.
2. Get a Testnet Algorand address opted in to Testnet USDC (asset
   `10458941`) — e.g. [Lora](https://lora.algokit.io/testnet), funded from
   the [Testnet dispenser](https://bank.testnet.algorand.network/).
3. Set `PAY_TO` to that address and restart. Boot log should read
   `x402 payments ENABLED for /explain` instead of the free-fallback warning.

No private key ever touches this codebase — `src/payments.js` only declares
a price and receiving address; `FACILITATOR_URL` handles verify + settle.

## Deploying

**Persistent-process host only** — Railway, Fly, Render, or any Docker host
(`Dockerfile`/`Procfile` included). **Not Vercel or other FaaS/serverless.**
The rate limiter keeps state in an in-process `Map`, and graceful shutdown
assumes a listening server the platform signals on redeploy. On serverless,
each invocation is a fresh process — the limiter's `Map` never accumulates
state, so per-IP limiting (the only abuse protection in free/unpaid mode)
silently becomes a no-op, and `app.listen()` doesn't fit the handler model
anyway. Real serverless support would need a handler adapter *and* a
shared-store limiter (Redis/Upstash) — a rework, not a flag.

Behind a reverse proxy, set **`TRUST_PROXY=1`** — otherwise every request
looks like it comes from the proxy's one IP and per-IP rate limiting
collapses to a single shared bucket. Only set it once you've confirmed the
proxy actually overwrites inbound `X-Forwarded-For`, or a client can spoof
the header and bypass the limit entirely.

`SIGTERM`/`SIGINT` drain in-flight requests before exiting (verified against
a real `docker stop`, not just read — exits `0` with a clean drain log).

**Scaling past one instance:** the rate limiter is per-process. Multiple
instances behind a load balancer means multiple independent buckets — swap
in a shared-store limiter (Redis) before running more than one.

**Monitoring:** `/explain` depends on two external services with no
retry/fallback — the AlgoNode indexer and (paid mode) the GoPlausible
facilitator. Plain `/health` is liveness-only. Point uptime monitors at
**`/health?deep=1`** instead for a real readiness signal — it pings both
live and returns `503` if either is down. That route is itself rate-limited
and result-cached (15s TTL, in-flight deduped) so it can't become a free
amplifier against those services regardless of how many clients poll it.

## Security model

- **Untrusted on-chain strings.** `summary`, `assetName`, `unit`, `note` are
  all attacker-controlled (anyone can mint an ASA named `<script>...`).
  Safe as JSON; **not** HTML-escaped. Any HTML-rendering consumer must
  escape these fields itself.
- `/explain` is rate-limited per IP, stricter in free/unpaid mode (no
  payment gate to throttle abuse otherwise).
- `txid` is validated as 52 base32 chars **before** any network call and
  **before** the payment gate — a request that was always going to 400
  never gets charged.
- `PAY_TO` and the resolved USDC asset ID are validated at startup; the
  server refuses to boot rather than advertise a broken or wrong-network
  price.
- **Unverified protocol names never ship as fact.** `narrator.js` only
  states a name (e.g. "Tinyman AMM v2") when `knownApps.js` flags that entry
  `verified: true`; otherwise it says the honest "smart contract 12345".
  This is enforced in code, not convention — see "Before Mainnet" below.
- Payment is verified before the call runs but only **settles on a
  successful response** — a failed `/explain` call never charges the
  caller. Confirmed live repeatedly across review passes.

## Before Mainnet

Every entry in `src/knownApps.js` is `verified: false` (placeholders). The
narrator already refuses to state an unverified name, so this can't produce
a *wrong* label — but it does mean every matching `appl` call currently
reads as "smart contract 12345" instead of by name. Confirm each entry
against a block explorer (allo.info, Pera Explorer) and flip the flag before
Mainnet for better narration. No rush — the fallback is safe by
construction.

## Extending

- Found a transaction this explains badly? Paste its raw indexer JSON into
  `test/decoder.test.js` as a new fixture, then fix the code until it reads
  well. That loop is how the product compounds.
- Public AlgoNode endpoints need no API key; swap `MAINNET_INDEXER_URL` /
  `TESTNET_INDEXER_URL` if you hit limits.
- Grouped transactions (`group` field set) usually mean a swap or
  multi-step DeFi action. Explaining the *whole group* rather than one leg
  is the single biggest quality upgrade available — a natural v2.

## Review history

`Review.md` (gitignored, local only) has the full record of every review
pass on this project — first-principles findings, live verification steps,
and fix logs, newest section first. Read it before assuming something
hasn't been checked; it almost certainly has been.
