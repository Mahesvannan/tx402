/** Read-only catalog example. It never signs or spends. */

const BASE = (process.env.TX402_URL || 'https://tx402-production.up.railway.app').replace(/\/+$/, '');
const TXID = 'YRSG7IKDPCK4XMKFFTFFFYMIHF6SJOMHUOIE4FFUWNLEQ4WG2ZOQ';

function decodeChallenge(header) {
  if (!header) return null;
  return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
}

const requests = [
  ['single', `${BASE}/explain?txid=${TXID}`, {}],
  ['group', `${BASE}/group?txid=${TXID}`, {}],
  ['batch', `${BASE}/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ txids: [TXID], network: 'mainnet' }),
  }],
];

for (const [name, url, init] of requests) {
  const response = await fetch(url, { ...init, headers: { accept: 'application/json', ...init.headers } });
  const challenge = decodeChallenge(response.headers.get('payment-required'));
  console.log(name, response.status, challenge?.accepts?.[0] ?? await response.json());
}
