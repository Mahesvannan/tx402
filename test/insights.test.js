import assert from 'node:assert';
import { decodeTransaction } from '../src/decoder.js';
import { buildAccountInsight, buildGroupInsight, flattenTransactions } from '../src/insights.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message}`);
    failed++;
  }
}

const USER = 'HZ57J3K46JIJXILONBBZOHX6BKPXEM2VVXNRFSUED6DKFD5ZD24PMJ3MVA';
const OTHER = 'XOFKWHQIDXDVOZCITVWQ5C6XARTEZ7XPAMNY4CHYJT7UNRLGCWTRU3DL3Q';
const GROUP = 'Z3JvdXAtMTIz';
const assets = new Map([[31566704, { name: 'USDC', unitName: 'USDC', decimals: 6, verified: true }]]);

const rawGroup = [
  {
    id: 'A'.repeat(52),
    'tx-type': 'axfer',
    sender: USER,
    fee: 1000,
    group: GROUP,
    'round-time': 1721606400,
    'asset-transfer-transaction': {
      amount: 2500000,
      'asset-id': 31566704,
      receiver: OTHER,
    },
  },
  {
    id: 'B'.repeat(52),
    'tx-type': 'appl',
    sender: USER,
    fee: 2000,
    group: GROUP,
    'round-time': 1721606400,
    'application-transaction': {
      'application-id': 1002541853,
      'on-completion': 'noop',
      'application-args': [Buffer.from('swap').toString('base64')],
    },
    'inner-txns': [
      {
        'tx-type': 'pay',
        sender: OTHER,
        fee: 0,
        'round-time': 1721606400,
        'payment-transaction': { amount: 1000000, receiver: USER },
      },
    ],
  },
];
const decoded = rawGroup.map((raw) => decodeTransaction(raw, { assets, network: 'mainnet' }));

console.log('\ninsights');
test('flattens inner transactions without losing outer order', () => {
  const flattened = flattenTransactions(decoded);
  assert.strictEqual(flattened.length, 3);
  assert.strictEqual(flattened[2].type, 'pay');
});

test('builds a complete atomic group insight', () => {
  const insight = buildGroupInsight(decoded, decoded[0].txid, 'mainnet');
  assert.strictEqual(insight.transactionCount, 2);
  assert.strictEqual(insight.innerTransactionCount, 1);
  assert.strictEqual(insight.transfers.length, 2);
  assert.strictEqual(insight.totalFees.amount, '0.003');
  assert.strictEqual(insight.protocols[0].protocol, 'Tinyman');
  assert.ok(insight.summary.includes('atomic group'));
});

test('aggregates sent and received account activity by asset', () => {
  const insight = buildAccountInsight(USER, decoded, 'mainnet', 25);
  assert.strictEqual(insight.transactionCount, 2);
  assert.strictEqual(insight.totals.sent[0].amount, '2.50');
  assert.strictEqual(insight.totals.received[0].amount, '1');
  assert.strictEqual(insight.totals.feesPaid.amount, '0.003');
  assert.strictEqual(insight.uniqueCounterparties, 1);
  assert.strictEqual(insight.protocols[0].protocol, 'Tinyman');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
