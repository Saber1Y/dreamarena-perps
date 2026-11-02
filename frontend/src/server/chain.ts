import 'server-only';

import { createPublicClient, createWalletClient, getAddress, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import deployment from '../../../contracts/deployments/50383.json';
import { EXPLORER, PUBLIC_RPC, hideki } from '@/lib/chain';

export { EXPLORER, hideki };
export const RPC = process.env.HIDEKI_RPC ?? PUBLIC_RPC;

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
