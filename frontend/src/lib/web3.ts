import { http } from 'wagmi';
// `createConfig` must come from @privy-io/wagmi, not wagmi — it is the same
// config, plus the wiring that keeps Privy's connector state and wagmi's in sync.
import { createConfig } from '@privy-io/wagmi';

export const somniaTestnet = {
  id: 50312,
  name: 'Somnia Shannon Testnet',
  nativeCurrency: {
    name: 'STT',
    symbol: 'STT',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://dream-rpc.somnia.network'] },
    public: { http: ['https://dream-rpc.somnia.network'] },
  },
  blockExplorers: {
    default: {
      name: 'Shannon Explorer',
      url: 'https://shannon-explorer.somnia.network',
    },
  },
  testnet: true,
} as const;

export const config = createConfig({
  chains: [somniaTestnet],
  transports: {
    [somniaTestnet.id]: http('https://dream-rpc.somnia.network'),
  },
});

// Protocol addresses are fixed per chain and identical on testnet/mainnet via
// CREATE3. They match the SDK's SOMNIA_TESTNET_ADDRESSES, which is what the
// data layer actually uses — these are here for the reads that go through
// plain viem rather than the SDK.
const PROTOCOL = {
  binaryMarketsModule: '0x3ecC694Cef705358864a646142ac17A90E29e388',
  marketsCore: '0x2802504314685D89bF6C992CA5a8e7cC78bc0294',
  binarySettlement: '0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23',
  outcomeToken: '0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9',
  oracleHub: '0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b',
  collateralRouter: '0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C',
  tUSDC: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E',
} as const;

/**
 * OUR contracts come from the environment, never from a literal.
 *
 * The previous build hardcoded an earlier deployment here. Those contracts are
 * still on-chain but carry a different ABI, so reads against them decode into
 * garbage rather than failing — the worst kind of wrong. Deploy, then set these
 * from the deploy output.
 */
export const CONTRACTS = {
  ...PROTOCOL,
  arcadeEngine: process.env.NEXT_PUBLIC_ARCADE_ENGINE ?? '',
  daoFactory: process.env.NEXT_PUBLIC_DAO_FACTORY ?? '',
} as const;

/** False until the deploy output has been wired into .env.local. */
export const isDeployed = Boolean(CONTRACTS.arcadeEngine && CONTRACTS.daoFactory);

export const REACTIVITY_PRECOMPILE = '0x0000000000000000000000000000000000000100';
