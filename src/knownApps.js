/**
 * Curated on-chain identifiers. Protocol labels are only narrated when an
 * exact application ID has been checked against protocol-owned documentation
 * or an official SDK. Keep the source beside the value so updates are auditable.
 */

const TINYMAN_SOURCE = 'https://docs.tinyman.org/contracts';
const TINYMAN_SDK_SOURCE =
  'https://github.com/tinymanorg/tinyman-js-sdk/blob/master/src/validator.ts';
const FOLKS_SOURCE = 'https://docs.folks.finance/developer/contracts';
const PACT_SOURCE = 'https://github.com/pactfi/pact-py-sdk/blob/main/pactsdk/config.py';

function app(name, protocol, component, category, source, network = 'mainnet') {
  return Object.freeze({
    name,
    protocol,
    component,
    category,
    network,
    source,
    verified: true,
  });
}

export const KNOWN_APPS = Object.freeze({
  // Tinyman's protocol-owned docs and SDK.
  552635992: app(
    'Tinyman AMM v1.1',
    'Tinyman',
    'AMM v1.1 validator',
    'dex',
    TINYMAN_SDK_SOURCE
  ),
  1002541853: app(
    'Tinyman AMM v2',
    'Tinyman',
    'AMM v2 validator',
    'dex',
    TINYMAN_SOURCE
  ),
  3119560942: app(
    'Tinyman Swap Router',
    'Tinyman',
    'swap router',
    'dex',
    'https://github.com/tinymanorg/tinyman-js-sdk/blob/master/src/swap/router/constants.ts'
  ),

  // Folks Finance's current Algorand contract registry.
  971350278: app('Folks Finance Pool Manager', 'Folks Finance', 'pool manager', 'lending', FOLKS_SOURCE),
  971353536: app('Folks Finance Deposits', 'Folks Finance', 'deposit manager', 'lending', FOLKS_SOURCE),
  1093729103: app('Folks Finance Deposit Staking', 'Folks Finance', 'deposit staking', 'lending', FOLKS_SOURCE),
  971368268: app('Folks Finance ALGO Pool', 'Folks Finance', 'ALGO lending pool', 'lending', FOLKS_SOURCE),
  971370097: app('Folks Finance gALGO Pool', 'Folks Finance', 'gALGO lending pool', 'lending', FOLKS_SOURCE),
  2611131944: app('Folks Finance xALGO Pool', 'Folks Finance', 'xALGO lending pool', 'lending', FOLKS_SOURCE),
  3073474613: app('Folks Finance tALGO Pool', 'Folks Finance', 'tALGO lending pool', 'lending', FOLKS_SOURCE),
  971372237: app('Folks Finance USDC Pool', 'Folks Finance', 'USDC lending pool', 'lending', FOLKS_SOURCE),
  971372700: app('Folks Finance USDt Pool', 'Folks Finance', 'USDt lending pool', 'lending', FOLKS_SOURCE),
  971388781: app('Folks Finance General Loan', 'Folks Finance', 'general loan', 'lending', FOLKS_SOURCE),
  971388977: app('Folks Finance Stablecoin Loan', 'Folks Finance', 'stablecoin-efficiency loan', 'lending', FOLKS_SOURCE),
  971389489: app('Folks Finance ALGO Loan', 'Folks Finance', 'ALGO-efficiency loan', 'lending', FOLKS_SOURCE),
  3184333108: app('Folks Finance Ecosystem Loan', 'Folks Finance', 'Algorand ecosystem loan', 'lending', FOLKS_SOURCE),
  1040271396: app('Folks Finance Oracle 0', 'Folks Finance', 'oracle', 'oracle', FOLKS_SOURCE),
  971323141: app('Folks Finance Oracle 1', 'Folks Finance', 'oracle', 'oracle', FOLKS_SOURCE),
  971333964: app('Folks Finance Oracle Adapter', 'Folks Finance', 'oracle adapter', 'oracle', FOLKS_SOURCE),

  // Pact protocol infrastructure from Pact's official SDK. Individual Pact
  // liquidity pools each have their own app ID and are deliberately not
  // guessed from transaction shape alone.
  1027956681: app('Pact Gas Station', 'Pact', 'gas station', 'dex', PACT_SOURCE),
  1072843805: app('Pact Constant Product Factory', 'Pact', 'constant-product pool factory', 'dex', PACT_SOURCE),
  1076423760: app('Pact NFT Pool Factory', 'Pact', 'NFT constant-product pool factory', 'dex', PACT_SOURCE),
  1123472996: app('Pact Folks Lending Adapter', 'Pact', 'Folks lending pool adapter', 'dex', PACT_SOURCE),
});

/** Well-known ASAs cached to avoid an indexer lookup on the hot path. */
export const KNOWN_ASSETS = Object.freeze({
  0: { name: 'Algorand', unitName: 'ALGO', decimals: 6, verified: true, network: 'any' },
  31566704: { name: 'USDC', unitName: 'USDC', decimals: 6, verified: true, network: 'mainnet' },
  312769: { name: 'Tether USDt', unitName: 'USDt', decimals: 6, verified: true, network: 'mainnet' },
  793124631: { name: 'Governance ALGO', unitName: 'gALGO', decimals: 6, verified: true, network: 'mainnet' },
  1134696561: { name: 'xALGO', unitName: 'xALGO', decimals: 6, verified: true, network: 'mainnet' },
  2537013734: { name: 'tALGO', unitName: 'tALGO', decimals: 6, verified: true, network: 'mainnet' },
  10458941: { name: 'USDC (Testnet)', unitName: 'USDC', decimals: 6, verified: true, network: 'testnet' },
});

export function lookupApp(appId, network = 'mainnet') {
  if (appId === undefined || appId === null) return null;
  const known = KNOWN_APPS[Number(appId)] ?? null;
  return known && known.network === network ? known : null;
}

export function lookupAsset(assetId, network = 'mainnet') {
  if (assetId === undefined || assetId === null) return null;
  const known = KNOWN_ASSETS[Number(assetId)] ?? null;
  return known && (known.network === 'any' || known.network === network) ? known : null;
}
