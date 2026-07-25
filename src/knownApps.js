/**
 * Lookup tables that turn opaque on-chain IDs into names a human recognises.
 *
 * This is the single most valuable file in the project and the main thing
 * that is genuinely yours: raw indexer data can tell you "application-id
 * 1002541853 was called", but only a curated map can tell you that means
 * "Tinyman AMM v2". Grow this list over time — every entry you add makes
 * every future explanation better.
 *
 * NOTE: the App IDs below are PLACEHOLDERS marked with `verified: false`.
 * Before going to Mainnet, confirm each one against a block explorer
 * (allo.info / Pera Explorer) and flip the flag. Never ship an unverified
 * mapping as fact — a wrong protocol label is worse than no label.
 */

export const KNOWN_APPS = {
  // --- DEXes / AMMs ---
  1002541853: { name: 'Tinyman AMM v2', category: 'dex', verified: false },

  // --- Lending ---
  971368268: { name: 'Folks Finance', category: 'lending', verified: false },

  // --- Add your own as you verify them ---
};

/**
 * Well-known ASAs. The indexer can give you these too, but caching the
 * common ones avoids a network round-trip on the hot path.
 */
export const KNOWN_ASSETS = {
  0: { name: 'Algorand', unitName: 'ALGO', decimals: 6, verified: true },
  31566704: { name: 'USDC', unitName: 'USDC', decimals: 6, verified: true },
  312769: { name: 'Tether USDt', unitName: 'USDt', decimals: 6, verified: true },
  // Testnet USDC — same unit name, different ID
  10458941: { name: 'USDC (Testnet)', unitName: 'USDC', decimals: 6, verified: true },
};

export function lookupApp(appId) {
  if (appId === undefined || appId === null) return null;
  return KNOWN_APPS[Number(appId)] ?? null;
}

export function lookupAsset(assetId) {
  if (assetId === undefined || assetId === null) return null;
  return KNOWN_ASSETS[Number(assetId)] ?? null;
}
