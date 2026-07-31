---
marp: true
title: tx402 Pitch Deck
description: Six-slide hackathon pitch deck for tx402
paginate: true
---

# tx402

Plain-English Algorand transaction explanations, paid per call by AI agents using x402.

Live API: `https://tx402-production.up.railway.app`

GitHub: `https://github.com/Mahesvannan/tx402`

---

# Problem

Algorand transaction data is precise, but not readable by default.

- Amounts are stored in base units.
- Assets are numeric IDs.
- App calls are numeric IDs.
- Notes and grouped transactions need decoding.
- AI agents and apps should not each rebuild the same transaction decoder.

Result: developers spend time translating raw chain data before they can explain it to users.

---

# Solution

tx402 turns one Algorand transaction ID into:

- A clean plain-English summary.
- Structured JSON fields for apps and agents.
- Correctly scaled ALGO and ASA amounts.
- Decoded notes, fees, timestamps, counterparties, and known app labels.
- Deterministic output with no LLM in the serving path.

Example:

> Wallet ABC sent 12.30 USDC to wallet XYZ. Paid 0.001 ALGO in fees.

---

# x402 on Algorand

tx402 is a paid API endpoint using x402 on Algorand Mainnet.

Flow:

1. Agent calls `GET /explain?txid=...`.
2. API returns an x402 payment challenge.
3. Buyer signs an Algorand USDC payment client-side.
4. Facilitator verifies and settles payment.
5. API returns the transaction explanation.

Current price: `$0.005` USDC per explanation.

---

# Product Demo

Production endpoints:

- `/health` - live service health
- `/discovery` - pricing and route metadata
- `/openapi.json` - OpenAPI 3.1 spec
- `/explain` - paid transaction explanation

Developer integrations:

- Node client example
- OpenAPI specification
- MCP stdio wrapper for agent workflows

---

# Proof + Next Steps

Completed:

- Public HTTPS deployment on Railway.
- Algorand Mainnet USDC x402 configuration.
- First real Mainnet settlement.
- OpenAPI, Node client, and MCP wrapper.

First settlement:

- Amount: `0.005000` USDC
- TxID: `XA7HMRPUV4X2GWI4AAGUT5FKAVTNCQJ5ZMUNTVTBKG3GZMES27LA`

Next: expand transaction coverage, verified protocol labels, and agent marketplace distribution.
