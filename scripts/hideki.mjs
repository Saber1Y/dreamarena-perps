// Shared connection to the Hideki perps testnet (chain 50383), as the
// dreamDEX "Perps on testnet for developers" page sets it up.

import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets } from '@somnia-chain/markets-sdk';
import { hidekiTestnet } from '@somnia-chain/markets-sdk/chains';
import { createPublicClient, http } from 'viem';

export const RPC = process.env.HIDEKI_RPC ?? 'https://api.hideki2.infra.testnet.somnia.network';
export const WS = process.env.HIDEKI_WS ?? 'wss://api.hideki2.infra.testnet.somnia.network/ws';
export const INDEXER = process.env.HIDEKI_INDEXER ?? 'https://hideki-dev.smk.somnia.host/v1/graphql';
export const EXPLORER = 'https://explorer.testnet.somnia.network/tokyo';

/** The perps MarginBank singleton, from the developer docs' contract table. */
export const MARGIN_BANK = '0x478769E1177C0773c43A593DCCc4Ad15F15F1394';

export function connect(privateKey) {
  return new SomniaMarkets({
    chain: hidekiTestnet,
    indexerUrl: INDEXER,
    wsRpcUrl: WS,
    addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
    ...(privateKey ? { privateKey } : {}),
  });
}

export const publicClient = createPublicClient({ chain: hidekiTestnet, transport: http(RPC) });

export const fmt = (raw, decimals) => Number(raw) / 10 ** Number(decimals);
