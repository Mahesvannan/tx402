#!/usr/bin/env node

// Backwards-compatible entry point for repository users. The publishable MCP
// package owns the implementation so local and npm installs cannot drift.
await import('../packages/tx402-mcp/bin/tx402-mcp.mjs');
