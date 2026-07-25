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

Raw indexer JSON optimises for machines doing bookkeeping, not for an agent
reporting back to a human — amounts as unscaled integers, assets as bare
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
3. Restart — boot log should show payments enabled instead of the free-mode warning.

No private key ever touches this codebase; a hosted facilitator handles
verifying and settling payment. Full setup, deploy, and security details are
in [`CLAUDE.md`](./CLAUDE.md).

## Roadmap

- [x] Phase 1 — core explainer, free and local
- [x] Phase 2 — x402 payment middleware on Testnet, verified end-to-end
- [ ] Phase 3 — deploy to a public HTTPS host (persistent-process only — see `CLAUDE.md`)
- [ ] Phase 4 — flip config to Mainnet
- [ ] Phase 5 — first real Mainnet settlement
- [ ] Phase 6 — example client, OpenAPI spec, optional MCP wrapper

## Learn more

See [`CLAUDE.md`](./CLAUDE.md) for architecture, the full file layout,
deploying, scaling, monitoring, and the security model.
