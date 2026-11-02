import { defineChain } from 'viem';

// The chain as both the server and a player's wallet see it. dreamDEX perps
// live on Hideki, which the explorer and dreamDEX call Somnia Tokyo.

export const PUBLIC_RPC = 'https://api.hideki2.infra.testnet.somnia.network';
export const EXPLORER = 'https://explorer.testnet.somnia.network/tokyo';
/** 1 STT to any address holding less than 1 STT. */
export const FAUCET = 'https://explorer.testnet.somnia.network/tokyo/faucet';
/** Joining dreamDEX's Perps Arena grants 1,000 paper USDso a week. */
export const DREAMDEX_ARENA = 'https://app.testnet.dreamdex.io/competition';

export const hideki = defineChain({
  id: 50383,
  name: 'Somnia Tokyo',
  nativeCurrency: { name: 'Somnia Test Token', symbol: 'STT', decimals: 18 },
  rpcUrls: { default: { http: [PUBLIC_RPC] } },
  blockExplorers: { default: { name: 'Somnia Tokyo explorer', url: EXPLORER } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
});
