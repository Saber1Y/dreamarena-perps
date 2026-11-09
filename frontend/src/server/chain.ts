import 'server-only';

import { createPublicClient, getAddress, http, type Address } from 'viem';
import deployment from '../../../contracts/deployments/50383.json';
import { EXPLORER, PUBLIC_RPC, hideki } from '@/lib/chain';

export { EXPLORER, hideki };
export const RPC = process.env.HIDEKI_RPC ?? PUBLIC_RPC;

/** The deployed arena, overridable for a fresh deployment. */
export const ARENA: Address = getAddress(process.env.PERPS_ARENA ?? deployment.contracts.perpsArena);
export const MARGIN_BANK: Address = getAddress(deployment.protocol.marginBank);

// The RPC sometimes takes over viem's default 10s to answer.
export const publicClient = createPublicClient({ chain: hideki, transport: http(RPC, { timeout: 30_000 }) });

