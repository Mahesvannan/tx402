# tx402 Demo Video Script

Target length: 3-5 minutes.

Recommended recording setup:

- Browser tab 1: GitHub repo or README.
- Browser tab 2: `https://tx402-production.up.railway.app/openapi.json`
- Terminal: project root.
- Do not show `.env` or wallet mnemonic files on screen.

## 0:00-0:25 - Intro

Say:

> Hi, this is tx402. It turns cryptic Algorand transaction data into plain-English explanations, and the API is paid per call using x402 on Algorand.

Show:

- Project name: `tx402`
- Live URL: `https://tx402-production.up.railway.app`
- GitHub repo: `https://github.com/Mahesvannan/tx402`

## 0:25-1:05 - Problem

Say:

> Raw Algorand transaction data is built for machines. Amounts are in base units, assets are numeric IDs, notes may be encoded, and app IDs are hard to understand. Agents, wallets, portfolio tools, and compliance tools need a readable explanation without building this decoding layer themselves.

Show:

- `README.md` architecture or API section.
- Mention that output is deterministic and does not require an LLM in the serving path.

## 1:05-1:45 - Live API discovery

Run:

```powershell
$env:TX402_URL='https://tx402-production.up.railway.app'
$env:DEEP_HEALTH_NETWORK='mainnet'
npm run smoke
```

Expected output:

- `/health` returns `200`
- `/health?deep=1` returns `200`
- `/discovery` shows `priced=true`
- unpaid `/explain` returns `402`

Say:

> Discovery shows that `/explain` is priced at half a cent, and the unpaid request correctly returns a 402 payment challenge.

## 1:45-2:25 - OpenAPI + agent integration

Show:

```text
https://tx402-production.up.railway.app/openapi.json
```

Run:

```powershell
npm run example:client
```

Say:

> The example client is read-only by default. It fetches discovery metadata and prints the x402 payment requirements without spending funds. This is useful for agents and developers integrating the API safely.

Mention:

- OpenAPI spec is available for regular app integrations.
- MCP wrapper is available for agent workflows:

```powershell
npm run mcp
```

## 2:25-3:25 - Paid x402 flow on Algorand

Recommended: show the completed Mainnet settlement already documented in the repo, unless you want to spend another `0.005` USDC during recording.

Say:

> For the Mainnet payment proof, tx402 has already completed a real x402 settlement on Algorand Mainnet. The buyer paid 0.005 USDC, the receiver balance increased by exactly 0.005 USDC, and the transaction is recorded on-chain.

Show:

```text
Settlement TxID:
XA7HMRPUV4X2GWI4AAGUT5FKAVTNCQJ5ZMUNTVTBKG3GZMES27LA
```

If you want to record a fresh paid call, this will spend `0.005` USDC:

```powershell
$env:TX402_EXAMPLE_PAY='1'
$env:CONFIRM_MAINNET_PAYMENT='1'
$env:BUYER_WALLET_FILE='.mainnet-buyer-wallet.local.json'
npm run example:client 7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ
Remove-Item Env:\TX402_EXAMPLE_PAY -ErrorAction SilentlyContinue
Remove-Item Env:\CONFIRM_MAINNET_PAYMENT -ErrorAction SilentlyContinue
```

Do not open or print `.mainnet-buyer-wallet.local.json`.

## 3:25-4:15 - Result and target users

Say:

> The result is a simple paid primitive: give tx402 a transaction ID, pay with x402 on Algorand, and get a readable explanation plus structured JSON. The target users are AI agents, wallets, portfolio trackers, compliance workflows, block explorers, and developers building paid x402 endpoints.

Show:

- `examples/node-client.mjs`
- `mcp/tx402-mcp.mjs`
- `openapi.json`

## 4:15-4:45 - Close

Say:

> tx402 demonstrates x402 as a practical payment layer for agent-accessible APIs on Algorand. It is live on Mainnet, has completed a real settlement, and ships with developer-facing integration assets.

End on:

- Live URL
- GitHub URL
- First settlement TxID
