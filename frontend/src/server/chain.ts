import 'server-only';

import { createPublicClient, createWalletClient, defineChain, getAddress, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import deployment from '../../../contracts/deployments/50383.json';

export const RPC = process.env.HIDEKI_RPC ?? 'https://api.hideki2.infra.testnet.somnia.network';
export const EXPLORER = 'https://explorer.testnet.somnia.network/tokyo';

export const hideki = defineChain({
  id: 50383,
  name: 'Somnia Hideki testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: 'Somnia Tokyo explorer', url: EXPLORER } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
});

/** The deployed arena, overridable for a fresh deployment. */
export const ARENA: Address = getAddress(process.env.PERPS_ARENA ?? deployment.contracts.perpsArena);
export const MARGIN_BANK: Address = getAddress(deployment.protocol.marginBank);

// The RPC sometimes takes over viem's default 10s to answer.
export const publicClient = createPublicClient({ chain: hideki, transport: http(RPC, { timeout: 30_000 }) });

/** The linked bot, or null when this deployment is read-only. */
export const bot = process.env.PRIVATE_KEY ? privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`) : null;

/** The Perps Arena wallet the console trades, or null when none is configured. */
export const owner: Address | null = process.env.OWNER_ADDRESS ? getAddress(process.env.OWNER_ADDRESS) : null;

export const walletClient = bot
  ? createWalletClient({ account: bot, chain: hideki, transport: http(RPC, { timeout: 30_000 }) })
  : null;
