'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import type { Address } from 'viem';
import { publicClient, toHuman, explorerTx } from '@/lib/dreamdex';
import { ARCADE_ENGINE_ABI } from '@/lib/abis';
import { CONTRACTS, isDeployed } from '@/lib/web3';

const ENGINE = CONTRACTS.arcadeEngine as Address;

export interface Settlement {
  marketId: `0x${string}`;
  player: Address;
  won: boolean;
  /** Outcome shares held — the tUSDC a win redeems for, 1:1. */
  shares: number;
  newStreak: number;
  txHash: string;
  explorer: string;
  blockNumber: bigint;
}

function decode(log: any): Settlement | null {
  const { marketId, player, won, newStreak, shares } = log.args ?? {};
  if (!marketId || !player) return null;
  return {
    marketId,
    player,
    won: Boolean(won),
    shares: shares ? toHuman(shares) : 0,
    newStreak: newStreak ? Number(newStreak) : 0,
    txHash: log.transactionHash ?? '',
    explorer: explorerTx(log.transactionHash ?? ''),
    blockNumber: log.blockNumber as bigint,
  };
}

const key = (s: Settlement) => `${s.marketId}:${s.player}:${s.txHash}`;

/**
 * Watch ArcadeEngine settle games.
 *
 * Every one of these logs is emitted from inside a reactive callback — the
 * oracle answered, the 0x0100 precompile dispatched, and the engine resolved,
 * all in one block. Nothing here polls for an outcome; the chain pushes it.
 */
export function useSettlements(limit = 20) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const seen = useRef<Set<string>>(new Set());

  const ingest = useCallback(
    (logs: any[]) => {
      const fresh = logs
        .map(decode)
        .filter((s): s is Settlement => s !== null && !seen.current.has(key(s)));
      if (fresh.length === 0) return;
      fresh.forEach((s) => seen.current.add(key(s)));
      setSettlements((prev) => [...fresh.reverse(), ...prev].slice(0, limit));
    },
    [limit],
  );

  useEffect(() => {
    if (!isDeployed) {
      setLoading(false);
      return;
    }
    let active = true;

    // Seed with recent history so the feed is not empty on first paint. This
    // RPC caps getLogs at 1000 blocks, which on Somnia is a short window — an
    // empty result here is normal, not an error.
    (async () => {
      try {
        const head = await publicClient.getBlockNumber();
        const logs = await publicClient.getLogs({
          address: ENGINE,
          event: ARCADE_ENGINE_ABI.find(
            (a: any) => a.type === 'event' && a.name === 'GameResolved',
          ) as any,
          fromBlock: head - 999n,
          toBlock: head,
        });
        if (active) ingest(logs);
      } catch {
        // Historical range unsupported or empty — the live watcher still works.
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unwatch = publicClient.watchContractEvent({
      address: ENGINE,
      abi: ARCADE_ENGINE_ABI,
      eventName: 'GameResolved',
      onLogs: ingest,
    });

    return () => {
      active = false;
      unwatch?.();
    };
  }, [ingest]);

  return { settlements, loading };
}

/** The connected player's own most recent settlement, for the celebration. */
export function usePlayerSettlement() {
  const { address } = useAccount();
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [visible, setVisible] = useState(false);
  const lastKey = useRef('');

  useEffect(() => {
    if (!address || !isDeployed) return;
    lastKey.current = '';
    setSettlement(null);
    setVisible(false);

    const unwatch = publicClient.watchContractEvent({
      address: ENGINE,
      abi: ARCADE_ENGINE_ABI,
      eventName: 'GameResolved',
      args: { player: address },
      onLogs: (logs: any[]) => {
        for (const log of logs) {
          const s = decode(log);
          if (!s || key(s) === lastKey.current) continue;
          lastKey.current = key(s);
          setSettlement(s);
          setVisible(true);
        }
      },
    });

    return () => unwatch?.();
  }, [address]);

  return { settlement, visible, dismiss: useCallback(() => setVisible(false), []) };
}

export interface CallbackPulse {
  marketId: `0x${string}`;
  yesWon: boolean;
  voided: boolean;
  entrantCount: number;
  blockNumber: bigint;
  txHash: string;
}

/**
 * Every reactive callback the engine receives — not just ones with a bet on them.
 *
 * `OracleAnswered` fires on every market the precompile dispatches to us, so
 * this is populated continuously whether or not anyone is playing. It is the
 * honest, always-on evidence that the chain is calling us: no keeper, no cron,
 * and nothing here polls for an outcome.
 */
export function useOracleCallbacks(limit = 12) {
  const [pulses, setPulses] = useState<CallbackPulse[]>([]);
  const [loading, setLoading] = useState(true);
  const seen = useRef<Set<string>>(new Set());

  const ingest = useCallback(
    (logs: any[]) => {
      const fresh: CallbackPulse[] = [];
      for (const log of logs) {
        const { marketId, yesWon, voided, entrantCount } = log.args ?? {};
        if (!marketId) continue;
        const key = `${marketId}:${log.transactionHash}`;
        if (seen.current.has(key)) continue;
        seen.current.add(key);
        fresh.push({
          marketId,
          yesWon: Boolean(yesWon),
          voided: Boolean(voided),
          entrantCount: entrantCount ? Number(entrantCount) : 0,
          blockNumber: log.blockNumber as bigint,
          txHash: log.transactionHash ?? '',
        });
      }
      if (fresh.length === 0) return;
      setPulses((prev) => [...fresh.reverse(), ...prev].slice(0, limit));
    },
    [limit],
  );

  useEffect(() => {
    if (!isDeployed) {
      setLoading(false);
      return;
    }
    let active = true;

    (async () => {
      try {
        const head = await publicClient.getBlockNumber();
        const logs = await publicClient.getLogs({
          address: ENGINE,
          event: ARCADE_ENGINE_ABI.find(
            (a: any) => a.type === 'event' && a.name === 'OracleAnswered',
          ) as any,
          fromBlock: head - 999n,
          toBlock: head,
        });
        if (active) ingest(logs);
      } catch {
        // short window, empty is normal
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unwatch = publicClient.watchContractEvent({
      address: ENGINE,
      abi: ARCADE_ENGINE_ABI,
      eventName: 'OracleAnswered',
      onLogs: ingest,
    });

    return () => {
      active = false;
      unwatch?.();
    };
  }, [ingest]);

  return { pulses, loading };
}
