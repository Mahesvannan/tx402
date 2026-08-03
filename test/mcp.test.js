import assert from 'node:assert';
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['packages/tx402-mcp/bin/tx402-mcp.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, TX402_MCP_ENABLE_PAYMENTS: '0' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

const responses = new Map();
let stdoutBuffer = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk;
  const lines = stdoutBuffer.split('\n');
  stdoutBuffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined) responses.set(message.id, message);
  }
});

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function waitFor(id, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (responses.has(id)) return responses.get(id);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for MCP response ${id}`);
}

try {
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'tx402-test', version: '1.0.0' },
    },
  });
  const initialized = await waitFor(1);
  assert.strictEqual(initialized.result.serverInfo.name, 'tx402');
  assert.strictEqual(initialized.result.serverInfo.version, '0.2.0');

  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const listed = await waitFor(2);
  const names = listed.result.tools.map((tool) => tool.name).sort();
  assert.deepStrictEqual(names, [
    'explain_algorand_atomic_group',
    'explain_algorand_transaction',
    'explain_algorand_transaction_batch',
    'summarize_algorand_account_activity',
  ]);
  console.log('  PASS  MCP initializes and exposes all four v0.2.0 tools');
} finally {
  child.stdin.end();
  child.kill();
}
