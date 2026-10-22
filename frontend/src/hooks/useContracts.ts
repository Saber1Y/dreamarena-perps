'use client';

import { useMemo } from 'react';
import { useReadContract, useReadContracts, useAccount } from 'wagmi';
import type { Address } from 'viem';
import { ARCADE_ENGINE_ABI, COMMUNITY_DAO_FACTORY_ABI } from '@/lib/abis';
import { CONTRACTS, isDeployed } from '@/lib/web3';
import { toHuman } from '@/lib/dreamdex';
import { useSettlements } from '@/hooks/useSettlements';

const ENGINE = CONTRACTS.arcadeEngine as Address;
const FACTORY = CONTRACTS.daoFactory as Address;

/**
 * The player's arcade record, straight from ArcadeEngine.
 *
 * The streak is CONSECUTIVE WINS, not calendar days — it is moved only by the
 * oracle's own resolution arriving through the reactive callback, so it cannot
 * be advanced by showing up.
 */
export function usePlayerStats() {
  const { address, isConnected } = useAccount();

  const { data, isLoading, refetch } = useReadContract({
    address: ENGINE,
    abi: ARCADE_ENGINE_ABI,
    functionName: 'getPlayerStats',
    args: address ? [address] : undefined,
    query: { enabled: isDeployed && !!address },
  });

  // getPlayerStats → [streak, longest, multiplier, wins, losses, shares, bossRound, slain]
  const s = data as
    | readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
    | undefined;
  const wins = s ? Number(s[3]) : 0;
  const losses = s ? Number(s[4]) : 0;
  const played = wins + losses;

  return {
    streak: s ? Number(s[0]) : 0,
    longestStreak: s ? Number(s[1]) : 0,
    multiplier: s ? Number(s[2]) / 100 : 1,
    wins,
    losses,
    played,
    winRate: played > 0 ? Math.round((wins / played) * 100) : 0,
    totalShares: s ? toHuman(s[5]) : 0,
    bossRound: s ? Number(s[6]) : 0,
    bossesSlain: s ? Number(s[7]) : 0,
    isLoading,
    isConnected,
    refetch,
  };
}

export function useDAOCount() {
  const { data, isLoading } = useReadContract({
    address: FACTORY,
    abi: COMMUNITY_DAO_FACTORY_ABI,
    functionName: 'getDAOCount',
    query: { enabled: isDeployed },
  });
  return { count: data ? Number(data) : 0, isLoading };
}

export interface DAOInfo {
  id: number;
  name: string;
  symbol: string;
  creator: Address;
  treasury: Address;
  builderFeeBpsTimes1k: bigint;
  createdAt: bigint;
}

export function useDAO(daoId: number | null) {
  const { data, isLoading } = useReadContract({
    address: FACTORY,
    abi: COMMUNITY_DAO_FACTORY_ABI,
    functionName: 'getDAO',
    args: daoId === null ? undefined : [BigInt(daoId)],
    query: { enabled: isDeployed && daoId !== null },
  });

  const d = data as Omit<DAOInfo, 'id'> | undefined;
  return { dao: d && daoId !== null ? { id: daoId, ...d } : null, isLoading };
}

/** Whether the connected wallet already deployed an arena (one per address). */
export function useHasDAO() {
  const { address } = useAccount();
  const { data } = useReadContract({
    address: FACTORY,
    abi: COMMUNITY_DAO_FACTORY_ABI,
    functionName: 'hasDAO',
    args: address ? [address] : undefined,
    query: { enabled: isDeployed && !!address },
  });
  return Boolean(data);
}

/**
 * The standings.
 *
 * ArcadeEngine keeps per-player counters but no sorted index — ranking on-chain
 * would cost every player gas to maintain a list only the UI reads. So we
 * discover players from the settlement stream and then read their authoritative
 * stats back from the contract.
 *
 * The honest caveat: player DISCOVERY is bounded by the log window this RPC
 * serves (1000 blocks) plus whatever has streamed in since the page opened. The
 * numbers per player are exact; the roster is "everyone who has settled
 * recently", which is what a live arcade leaderboard should show anyway.
 */
export function useLeaderboard() {
  const { settlements, loading: watching } = useSettlements(200);

  const players = useMemo(() => {
    const seen = new Set<string>();
    for (const s of settlements) seen.add(s.player.toLowerCase());
    return [...seen] as Address[];
  }, [settlements]);

  const { data, isLoading } = useReadContracts({
    contracts: players.map((player) => ({
      address: ENGINE,
      abi: ARCADE_ENGINE_ABI,
      functionName: 'getPlayerStats' as const,
      args: [player] as const,
    })),
    query: { enabled: isDeployed && players.length > 0 },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    return data
      .map((entry, i) => {
        if (entry.status !== 'success') return null;
        const s = entry.result as readonly [
          bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
        ];
        const wins = Number(s[3]);
        const losses = Number(s[4]);
        const played = wins + losses;
        return {
          player: players[i],
          streak: Number(s[0]),
          longestStreak: Number(s[1]),
          multiplier: Number(s[2]) / 100,
          wins,
          losses,
          played,
          winRate: played > 0 ? Math.round((wins / played) * 100) : 0,
          bossesSlain: Number(s[7]),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.streak - a.streak || b.wins - a.wins || b.winRate - a.winRate);
  }, [data, players]);

  return { rows, isLoading: watching || isLoading };
}

export type LeaderboardRow = ReturnType<typeof useLeaderboard>['rows'][number];
