'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { requireSigner } from '@/lib/signer';
import type { Address } from 'viem';
import { isDeployed } from '@/lib/web3';
import {
  listLiveMarkets,
  getOdds,
  getSpotPrice,
  placeBet,
  recordEntry,
  type ArenaMarket,
  type Odds,
  type BetResult,
} from '@/lib/dreamdex';

/** Binary series roll continuously, so the board is re-read on this cadence. */
const BOARD_REFRESH_MS = 10_000;

/**
 * The live market board.
 *
 * These markets expire every 60s–5m, so this refreshes on a short timer and
 * prunes expired rows locally between polls — a stale market id sent to
 * `createOrder` is a guaranteed revert.
 */
export function useMarkets() {
  const [markets, setMarkets] = useState<ArenaMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await listLiveMarkets();
        if (!active) return;
        setMarkets(data);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Could not reach the market indexer');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const poll = setInterval(load, BOARD_REFRESH_MS);
    // Drop expired markets between polls so the UI never offers a dead one.
    const prune = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      setMarkets((prev) => (prev.some((m) => m.expiry <= now) ? prev.filter((m) => m.expiry > now) : prev));
    }, 1000);

    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(prune);
    };
  }, []);

  return { markets, loading, error };
}

/** Seconds left before a market expires, ticking locally. */
export function useCountdown(expiry: number | undefined) {
  const [left, setLeft] = useState(() =>
    expiry ? Math.max(0, expiry - Math.floor(Date.now() / 1000)) : 0,
  );

  useEffect(() => {
    if (!expiry) return;
    const tick = () => setLeft(Math.max(0, expiry - Math.floor(Date.now() / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiry]);

  return left;
}

/** Live book odds for one side of a market. */
export function useOdds(market: ArenaMarket | null, up: boolean | null) {
  const [odds, setOdds] = useState<Odds | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!market || up === null) {
      setOdds(null);
      return;
    }
    let active = true;
    setLoading(true);

    async function read() {
      try {
        const next = await getOdds(market!.pool, up!);
        if (active) setOdds(next);
      } catch {
        if (active) setOdds(null); // an unreadable book reads as "no quote"
      } finally {
        if (active) setLoading(false);
      }
    }

    read();
    const id = setInterval(read, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [market, up]);

  return { odds, loading };
}

/** The oracle's live index price for an asset, for the reference ticker. */
export function useSpotPrice(asset: string | undefined) {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!asset) return;
    let active = true;
    const read = () => getSpotPrice(asset).then((p) => active && setPrice(p)).catch(() => {});
    read();
    const id = setInterval(read, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [asset]);

  return price;
}

export type BetStage = 'idle' | 'trading' | 'recording' | 'done';

/**
 * The bet flow, both legs.
 *
 * 1. A real taker order on the market's own book — this is the money.
 * 2. `recordEntry` on ArcadeEngine — this is the game, and it is what the
 *    reactive settlement later moves the player's streak from.
 *
 * Leg 2 failing does not undo leg 1: the player still holds a real position
 * that still redeems. We surface that plainly rather than implying the bet
 * was lost.
 */
export function usePlaceBet() {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const [stage, setStage] = useState<BetStage>('idle');
  const [result, setResult] = useState<BetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const bet = useCallback(
    async (
      market: ArenaMarket,
      up: boolean,
      stake: number,
      gameType = 0,
      arena?: { builder?: Address; builderFeeBpsTimes1k?: bigint },
    ) => {
      setError(null);
      setWarning(null);
      setResult(null);

      try {
        // Both guards sit inside the try: thrown above it they never reach
        // setError, and the button reads as dead when clicked.
        const signer = requireSigner(walletClient, address);
        if (!isDeployed) {
          throw new Error(
            'ArcadeEngine is not configured — set NEXT_PUBLIC_ARCADE_ENGINE from the deploy output.',
          );
        }

        setStage('trading');
        const filled = await placeBet({
          market,
          up,
          stake,
          walletClient: signer,
          // Routed through an arena, the pool pays its treasury a builder fee.
          builder: arena?.builder,
          builderFeeBpsTimes1k: arena?.builderFeeBpsTimes1k,
        });
        if (mounted.current) setResult(filled);

        setStage('recording');
        try {
          await recordEntry(signer, market, up, filled.shares, gameType);
        } catch {
          if (mounted.current) {
            setWarning(
              'Your position is live on-chain, but the arcade could not record it — ' +
                'this bet will not count towards your streak.',
            );
          }
        }

        if (mounted.current) setStage('done');
        return filled;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'The bet did not go through';
        if (mounted.current) {
          setError(message);
          setStage('idle');
        }
        throw err;
      }
    },
    [walletClient, address],
  );

  const reset = useCallback(() => {
    setStage('idle');
    setResult(null);
    setError(null);
    setWarning(null);
  }, []);

  return { bet, stage, result, error, warning, reset, isPlacing: stage === 'trading' || stage === 'recording' };
}
