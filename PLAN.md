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

Status: ready to publish — maintainer authentication required

- Package the MCP wrapper as the public `tx402-mcp` npm package.
- Support `npx tx402-mcp` and document read-only and paid-wallet modes.
- Add official MCP Registry `server.json` metadata.
- Validate the package tarball locally, then publish to npm and the MCP
  Registry when the maintainer is authenticated.

Prepared and validated: the `tx402-mcp@0.1.0` dry-run tarball contains only the
package README, executable, and package metadata; `server.json` passes the
official MCP Registry JSON schema. Remaining external steps require `npm login`
and MCP Registry GitHub authentication.

## 4. Broader product value

Status: planned

- Explain complete Algorand atomic transaction groups.
- Add a batch explanation endpoint.
- Expand verified protocol labels for Tinyman, Folks Finance, Pact, and other
  high-value Algorand applications.
- Add account-activity summaries for portfolio and compliance agents.

## 5. Targeted distribution

Status: planned

- Present tx402 to Algorand wallet, explorer, portfolio, tax, and compliance
  developers with copy-paste integrations.
- Publish it through the MCP Registry and relevant x402/agent directories.
- Share a short technical demo through the Algorand developer forum, Discord,
  X, and hackathon showcase.
- Propose an integration example for the GoPlausible Algorand MCP ecosystem.

## 6. Adoption analytics

Status: planned

- Measure landing-page visits, demo calls, 402 challenges, successful paid
  calls, unique external payer addresses, and repeat usage.
- Track the conversion from demo to payment without collecting wallet secrets
  or unnecessary personal data.
- Use those measurements to prioritize product coverage and distribution.
