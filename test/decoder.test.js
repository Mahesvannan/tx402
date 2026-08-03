/**
 * Fixture-based tests. No network required.
 *
 * The fixtures below match the shape the Algorand indexer actually returns
 * from GET /v2/transactions/{txid}. When you hit a real transaction that
 * this code explains badly, paste its raw JSON in here as a new fixture,
 * then fix the code until the test passes. That is how the quality of the
 * explanations compounds over time.
 */

import assert from 'node:assert';
import { decodeTransaction, formatAmount, decodeNote } from '../src/decoder.js';
import { narrate } from '../src/narrator.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

console.log('\nformatAmount');
test('6dp USDC base units render as decimal', () => {
  assert.strictEqual(formatAmount(12300000, 6), '12.30');
});
test('whole numbers stay clean', () => {
  assert.strictEqual(formatAmount(5000000, 6), '5');
});
test('microalgo fee renders correctly', () => {
  assert.strictEqual(formatAmount(1000, 6), '0.001');
});
test('zero decimals passes through', () => {
  assert.strictEqual(formatAmount(42, 0), '42');
});
test('handles very large amounts without float error', () => {
  assert.strictEqual(formatAmount('123456789012345678', 6), '123456789012.345678');
});

console.log('\ndecodeNote');
test('decodes printable utf8 note', () => {
  const b64 = Buffer.from('invoice-4821').toString('base64');
  assert.strictEqual(decodeNote(b64), 'invoice-4821');
});
test('rejects binary junk', () => {
  const b64 = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]).toString('base64');
  assert.strictEqual(decodeNote(b64), null);
});
test('null note stays null', () => {
  assert.strictEqual(decodeNote(null), null);
});

console.log('\npayment transaction');
const payFixture = {
  id: 'PS4XSAAEHUZM5QHDGZL2YXTQFH4B4QBGWKQKPHF5J7NL3ZBHVZ5A',
  'tx-type': 'pay',
  sender: 'HZ57J3K46JIJXILONBBZOHX6BKPXEM2VVXNRFSUED6DKFD5ZD24PMJ3MVA',
  fee: 1000,
  'confirmed-round': 39482013,
  'round-time': 1717243200,
  note: Buffer.from('rent payment').toString('base64'),
  'payment-transaction': {
    amount: 25500000,
    receiver: 'XOFKWHQIDXDVOZCITVWQ5C6XARTEZ7XPAMNY4CHYJT7UNRLGCWTRU3DL3Q',
    'close-remainder-to': null,
  },
};

test('decodes ALGO amount with correct decimals', () => {
  const d = decodeTransaction(payFixture);
  assert.strictEqual(d.transfer.amount, '25.50');
  assert.strictEqual(d.transfer.unit, 'ALGO');
});
test('narrates a payment readably', () => {
  const d = decodeTransaction(payFixture);
  const s = narrate(d);
  console.log(`        -> ${s}`);
  assert.ok(s.includes('25.50 ALGO'), 'should mention the amount');
  assert.ok(s.includes('rent payment'), 'should surface the note');
  assert.ok(s.includes('0.001 ALGO in fees'), 'should mention the fee');
});

console.log('\nasset transfer (USDC)');
const axferFixture = {
  id: '7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ',
  'tx-type': 'axfer',
  sender: 'HZ57J3K46JIJXILONBBZOHX6BKPXEM2VVXNRFSUED6DKFD5ZD24PMJ3MVA',
  fee: 1000,
  'confirmed-round': 40100000,
  'round-time': 1721606400,
  'asset-transfer-transaction': {
    amount: 12300000,
    'asset-id': 31566704,
    receiver: 'XOFKWHQIDXDVOZCITVWQ5C6XARTEZ7XPAMNY4CHYJT7UNRLGCWTRU3DL3Q',
  },
};
const usdc = { name: 'USDC', unitName: 'USDC', decimals: 6 };

test('applies asset decimals, not hardcoded 6', () => {
  const d = decodeTransaction(axferFixture, { asset: usdc });
  assert.strictEqual(d.transfer.amount, '12.30');
  assert.strictEqual(d.transfer.unit, 'USDC');
});
test('narrates an asset transfer readably', () => {
  const d = decodeTransaction(axferFixture, { asset: usdc });
  const s = narrate(d);
  console.log(`        -> ${s}`);
  assert.ok(s.includes('12.30 USDC'));
});

console.log('\nopt-in detection');
const optInFixture = {
  id: 'OPTIN000000000000000000000000000000000000000000000000',
  'tx-type': 'axfer',
  sender: 'HZ57J3K46JIJXILONBBZOHX6BKPXEM2VVXNRFSUED6DKFD5ZD24PMJ3MVA',
  fee: 1000,
  'round-time': 1721606400,
  'asset-transfer-transaction': {
    amount: 0,
    'asset-id': 31566704,
    receiver: 'HZ57J3K46JIJXILONBBZOHX6BKPXEM2VVXNRFSUED6DKFD5ZD24PMJ3MVA',
  },
};

test('recognises a 0-amount self-transfer as an opt-in', () => {
  const d = decodeTransaction(optInFixture, { asset: usdc });
  assert.strictEqual(d.isOptIn, true);
  const s = narrate(d);
  console.log(`        -> ${s}`);
  assert.ok(s.includes('opted in'), 'should say opted in, not "sent 0 USDC"');
});

console.log('\napplication call');
const applFixture = {
  id: 'APPL0000000000000000000000000000000000000000000000000',
  'tx-type': 'appl',
  sender: 'HZ57J3K46JIJXILONBBZOHX6BKPXEM2VVXNRFSUED6DKFD5ZD24PMJ3MVA',
  fee: 2000,
  'round-time': 1721606400,
  group: 'Z3JvdXBpZA==',
  'application-transaction': {
    'application-id': 1002541853,
    'on-completion': 'noop',
    'application-args': ['c3dhcA=='],
    'foreign-assets': [31566704],
  },
};

test('maps a known app id to a protocol name', () => {
  const d = decodeTransaction(applFixture);
  assert.strictEqual(d.application.protocol, 'Tinyman AMM v2');
});
test('flags grouped transactions in the narrative', () => {
  const d = decodeTransaction(applFixture);
  const s = narrate(d);
  console.log(`        -> ${s}`);
  assert.ok(s.includes('Tinyman AMM v2'));
  assert.ok(s.includes('"swap" operation'));
  assert.ok(s.includes('atomic transaction group'));
});

test('includes verified protocol provenance and decoded app operation', () => {
  const d = decodeTransaction(applFixture);
  assert.strictEqual(d.application.protocolName, 'Tinyman');
  assert.strictEqual(d.application.protocolVerified, true);
  assert.ok(d.application.protocolSource.includes('tinyman.org'));
  assert.strictEqual(d.application.action, 'swap');
});

console.log('\nunknown app id degrades gracefully');
const unknownAppFixture = {
  ...applFixture,
  'application-transaction': {
    ...applFixture['application-transaction'],
    'application-id': 999999999,
  },
};
test('falls back to the raw id rather than guessing', () => {
  const d = decodeTransaction(unknownAppFixture);
  assert.strictEqual(d.application.protocol, null);
  const s = narrate(d);
  console.log(`        -> ${s}`);
  assert.ok(s.includes('smart contract 999999999'));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
