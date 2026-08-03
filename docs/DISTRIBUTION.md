# tx402 Distribution Checklist

## Live discovery surfaces

- Production landing page and free demo
- OpenAPI 3.1 document
- `llms.txt`
- x402 resource manifest
- agent manifest
- x402 Bazaar metadata in every paid route challenge
- npm package `tx402-mcp`
- official MCP Registry server `io.github.Mahesvannan/tx402`
- GoPlausible facilitator merchant and resource records

## Target integrations

| Audience | Lead with | Integration |
|---|---|---|
| Wallets and explorers | Explain the whole action, not one opaque leg | `/group` |
| Portfolio apps | Normalize recent activity and protocols | `/account/activity` |
| Tax/compliance tools | Deterministic batch records and per-item errors | `/batch` |
| AI agents | One-command MCP plus x402 autonomous payment | `npx tx402-mcp` |
| Algorand developer tools | OpenAPI and verified protocol sources | `/openapi.json` |
| GoPlausible ecosystem | Compose Algorand lookup tools with human explanation | MCP proposal |

## Maintainer actions requiring an external account

The repository contains ready-to-paste copy in `submission/outreach-kit.md`.
Post it from the tx402 project profile to:

1. Algorand developer forum/showcase
2. Algorand developer Discord
3. X project profile
4. Hackathon showcase entry
5. Relevant wallet, explorer, portfolio, tax, and compliance repository discussions

Record the post URLs and dates here after posting. Do not automate unsolicited
messages or publish from a personal account without the maintainer's review.

## Success checks

- A third party reaches `/demo` from a campaign link.
- An external client receives a valid 402 challenge.
- At least one payer other than the maintainer completes a call.
- At least one payer makes a repeat call.
- A wallet, explorer, or agent links to the integration guide.
- `/analytics` shows demo-to-paid conversion without retaining user identities.
