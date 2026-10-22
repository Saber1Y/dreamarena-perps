'use client';

import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { publicClient } from '@/lib/dreamdex';
import { ARCADE_ENGINE_ABI } from '@/lib/abis';
import { CONTRACTS, isDeployed } from '@/lib/web3';
import { useToast } from '@/components/toast';
import type { Address } from 'viem';

const ENGINE = CONTRACTS.arcadeEngine as Address;
const EXPLORER_TX = (hash: string) => `https://shannon-explorer.somnia.network/tx/${hash}`;

export function ReactiveToasts() {
  const { push } = useToast();
  const { address } = useAccount();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isDeployed) return;
    const unwatch = publicClient.watchContractEvent({
      address: ENGINE,
      abi: ARCADE_ENGINE_ABI,
      eventName: 'GameResolved',
      onLogs: (logs: any[]) => {
        logs.forEach((log) => {
          const { sessionId, player, won, payout, newStreak } = log.args ?? {};
          const key = `${sessionId?.toString() ?? ''}:${log.transactionHash ?? ''}`;
          if (seen.current.has(key)) return;
          seen.current.add(key);

          const isMine = !!address && (player as Address).toLowerCase() === address.toLowerCase();
          const amount = payout ? Number(payout) / 1e6 : 0;
          const href = EXPLORER_TX(log.transactionHash as string);

          if (isMine) {
            push({
              type: won ? 'success' : 'error',
              title: won ? `Won ${amount.toFixed(2)} tUSDC!` : `Lost ${amount ? amount.toFixed(2) : 'your'} tUSDC`,
              detail: won ? `Streak: ${newStreak} 🔥` : `Streak reset to 0`,
              href,
            });
          } else {
            push({
              type: 'reactive',
              title: 'Bet settled on-chain',
              detail: `${won ? 'WON' : 'LOST'} ${amount.toFixed(2)} tUSDC · block #${log.blockNumber}`,
              href,
            });
          }
        });
      },
    });

    return () => unwatch?.();
  }, [address, push]);

  return null;
}
