# tx402 MCP

Use tx402 from any MCP-compatible AI client to turn Algorand transaction IDs
into plain-English explanations and structured fields.

## Run

```bash
npx tx402-mcp
```

The safe default does not spend funds. When the paid API returns HTTP 402, the
tool returns the payment requirements to the agent.

To let the MCP client pay from a local wallet, configure a funded Algorand
wallet file and explicitly enable Mainnet spending:

```powershell
$env:TX402_MCP_ENABLE_PAYMENTS="1"
$env:BUYER_WALLET_FILE="C:\path\to\buyer-wallet.json"
$env:CONFIRM_MAINNET_PAYMENT="1"
npx tx402-mcp
```

The wallet file stays local. tx402 never receives its mnemonic or private key;
the MCP process signs the x402 payment client-side.

Service: https://tx402-production.up.railway.app

Source: https://github.com/Mahesvannan/tx402

