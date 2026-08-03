# GoPlausible Algorand MCP Integration Proposal

## Goal

Compose GoPlausible's broad Algorand MCP lookup capabilities with tx402's
deterministic human-explanation layer.

## Suggested flow

1. The agent uses an Algorand MCP tool to find a transaction, account activity,
   Tinyman pool, or other on-chain object.
2. It sends the resulting transaction ID to tx402's MCP
   `explain_algorand_atomic_group` tool.
3. tx402 resolves every group leg and inner transaction, scales asset amounts,
   and attaches only source-verified protocol labels.
4. The agent gives the user the tx402 summary and structured fields, retaining
   the original IDs for auditability.

## Why the tools are complementary

GoPlausible provides broad discovery and protocol operations. tx402 specializes
in transaction narration, group-level semantics, batch normalization, and
recent account summaries. The composition avoids duplicating either project's
core while giving agents a cleaner human-facing answer.

## Copy-paste MCP configuration

```json
{
  "mcpServers": {
    "tx402": {
      "command": "npx",
      "args": ["-y", "tx402-mcp"]
    }
  }
}
```

The safe default reports x402 requirements without spending. Paid mode remains
an explicit local operator choice.
