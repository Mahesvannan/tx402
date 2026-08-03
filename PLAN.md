# tx402 Adoption Plan

The payment service is live and working. This roadmap focuses on turning it
from a deployed endpoint into a service that agents and developers can find,
try, install, and repeatedly use.

## 1. Standard x402 discovery metadata

Status: complete

- Attach the x402 Bazaar extension to the real `GET /explain` payment route.
- Publish machine-readable input and output schemas in the HTTP 402 challenge.
- Include the service name, tags, icon, MIME type, canonical resource URL, and
  realistic examples.
- Verify the challenge locally and complete one Mainnet settlement after
  deployment so the facilitator can re-index the resource.

Evidence: facilitator resource `ae5d9a0f8727b7c7` now contains method, MIME
type, description, Mainnet USDC acceptance, and Bazaar input/output discovery
metadata. Re-index settlement: `JIGXVV5E42SPTLDIRRBUWX6MQRA4TJANNSARBWJEB6PTOJ56A6AA`.

## 2. Free interactive demo

Status: complete

- Add a permanently free `/demo` endpoint backed only by allowlisted Mainnet
  transaction examples.
- Rate-limit and cache demo responses so it cannot become a free indexer proxy.
- Add an interactive landing-page control that shows tx402 output without
  requiring a wallet or payment.
- Document the demo in OpenAPI, README, discovery metadata, and `llms.txt`.

Live: `https://tx402-production.up.railway.app/demo?example=algo`

## 3. One-command MCP installation

Status: complete

- Package the MCP wrapper as the public `tx402-mcp` npm package.
- Support `npx tx402-mcp` and document read-only and paid-wallet modes.
- Add official MCP Registry `server.json` metadata.
- Validate the package tarball locally, then publish to npm and the MCP
  Registry.

Published and verified:

- npm package: `tx402-mcp@0.2.0`, published under the `latest` tag and
  installable with `npx tx402-mcp`.
- A clean temporary installation completed the MCP `initialize` and
  `tools/list` handshake successfully.
- Official MCP Registry server: `io.github.Mahesvannan/tx402`, version
  `0.2.0`, status active and latest.
- The package tarball contains only the package README, executable, and package
  metadata; `server.json` passes the official MCP Registry JSON schema.

## 4. Broader product value

Status: complete

- Explain complete Algorand atomic transaction groups.
- Add a batch explanation endpoint.
- Expand verified protocol labels for Tinyman, Folks Finance, Pact, and other
  high-value Algorand applications.
- Add account-activity summaries for portfolio and compliance agents.

Implemented in v0.2.0:

- `GET /group` resolves all outer legs and recursively decoded inner transactions.
- `POST /batch` returns per-item results for 1 to 10 unique transaction IDs.
- `GET /account/activity` aggregates asset flows, fees, counterparties, types,
  and verified protocol interactions for up to 50 recent transactions.
- Tinyman, Folks Finance, and Pact app IDs are labeled only from exact entries
  verified against protocol-owned documentation or official SDKs; every label
  includes its verification source.
- Version 0.2.0 is live at `https://tx402-production.up.railway.app`; production
  smoke checks passed for health, discovery, analytics, and all paid routes.

## 5. Targeted distribution

Status: implementation and registry distribution complete — external outreach
posting pending

- Present tx402 to Algorand wallet, explorer, portfolio, tax, and compliance
  developers with copy-paste integrations.
- Publish it through the MCP Registry and relevant x402/agent directories.
- Share a short technical demo through the Algorand developer forum, Discord,
  X, and hackathon showcase.
- Propose an integration example for the GoPlausible Algorand MCP ecosystem.

Prepared:

- Copy-paste integration guide for wallets, explorers, portfolio, tax,
  compliance, JavaScript, x402, and MCP clients.
- Distribution checklist, ready-to-post forum/Discord/X copy, and a dedicated
  GoPlausible MCP composition proposal.
- Agent, x402, OpenAPI, llms.txt, Bazaar, npm, and MCP Registry surfaces updated
  for the expanded product. Posting from external project accounts remains a
  maintainer action so no unsolicited messages are sent automatically.

## 6. Adoption analytics

Status: complete

- Measure landing-page visits, demo calls, 402 challenges, successful paid
  calls, unique external payer addresses, and repeat usage.
- Track the conversion from demo to payment without collecting wallet secrets
  or unnecessary personal data.
- Use those measurements to prioritize product coverage and distribution.

Implemented:

- `GET /analytics` reports aggregate funnel and per-route counters.
- Successful paid calls derive an in-memory salted payer hash solely to count
  unique and repeat usage; hashes and wallet addresses are never returned.
- Application access logs omit query strings and IP addresses. Analytics uses
  no cookies and stores no raw payment headers or wallet addresses.
- Counters reset with the process; aggregate snapshots are emitted to deployment
  logs every 15 minutes for operational history.
- The privacy-preserving analytics endpoint is live at
  `https://tx402-production.up.railway.app/analytics`.
