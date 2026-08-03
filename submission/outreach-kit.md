# tx402 Outreach Kit

## One-line pitch

tx402 turns Algorand transactions, atomic groups, and account activity into
plain English and structured JSON—paid per call in Mainnet USDC through x402.

## X post

Raw Algorand transactions are built for machines. tx402 explains a transaction,
the complete atomic group, or recent account activity in deterministic plain
English—no LLM in the serving path. Agents can try the free demo, install the
MCP with `npx tx402-mcp`, and pay per call in USDC via x402.

Demo: https://tx402-production.up.railway.app

GitHub: https://github.com/Mahesvannan/tx402

## Developer forum / Discord post

I built tx402, a deterministic explanation API for Algorand agents and developer
tools. It now supports single transactions, complete atomic groups including
inner transactions, batches of up to 10 transaction IDs, and recent account
activity summaries. Protocol names are only attached to exact app IDs verified
against protocol-owned docs or SDKs.

The free fixed demo needs no wallet. Production calls use x402 and settle
Mainnet USDC per successful response. MCP agents can run it with
`npx tx402-mcp`; OpenAPI, agent, x402, and llms.txt manifests are all public.

I would especially value feedback from wallet, explorer, portfolio, tax, and
compliance developers on the group and account response shapes.

Demo: https://tx402-production.up.railway.app

Integration guide: https://github.com/Mahesvannan/tx402/blob/master/docs/INTEGRATIONS.md

## Direct integration note

tx402 may fit your transaction-detail screen because `/group` converts every
outer and inner leg into one deterministic response with normalized asset
amounts, total fees, and source-verified protocol labels. The free demo and
OpenAPI contract are public; I can adapt the response shape around a concrete
wallet/explorer use case.
