'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { requireSigner } from '@/lib/signer';
import type { Address } from 'viem';
import {
  approveArena,
  effectiveBuilderFee,
  getArenaApproval,
  getPoolBuilderFeeCap,
  type ArenaMarket,
} from '@/lib/dreamdex';
import { useDAO, useDAOCount } from '@/hooks/useContracts';

const STORAGE_KEY = 'dreamarena.activeArena';

/**
 * The arena a player is currently playing under.
 *
 * Orders routed through an arena pay its builder fee to that arena's treasury,
 * which is the only thing an arena actually does. The choice is per-browser
 * because it is a preference, not chain state.
 */
export function useActiveArena() {
  const { count } = useDAOCount();
  const [daoId, setDaoId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setDaoId(stored === null || stored === '' ? null : Number(stored));
    setReady(true);
  }, []);

  const select = useCallback((id: number | null) => {
    setDaoId(id);
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  // A stored id from a previous deployment can outlive the factory it came from.
  const valid = daoId !== null && daoId < count ? daoId : null;
  const { dao } = useDAO(valid);

  return {
    daoId: valid,
    dao,
    arenaCount: count,
    ready,
    select,
    /** The treasury is the builder address that collects the fee. */
    builder: dao?.treasury as Address | undefined,
    builderFeeBpsTimes1k: dao?.builderFeeBpsTimes1k,
  };
}

/**
 * A pool's builder-fee ceiling, or null until read. Frozen per pool, so one
 * read per pool is enough.
 */
export function usePoolBuilderFeeCap(pool: Address | undefined) {
  const [cap, setCap] = useState<bigint | null>(null);
  useEffect(() => {
    let live = true;
    setCap(null);
    if (!pool) return;
    getPoolBuilderFeeCap(pool)
      .then((v) => live && setCap(v))
      .catch(() => live && setCap(0n));
    return () => {
      live = false;
    };
  }, [pool]);
  return cap;
}

/**
 * Whether this wallet has opted into paying an arena's fee on a given pool.
 *
 * The pool rejects any order carrying a non-zero builder fee without a prior
 * per-pool approval, so a routed bet needs this first or it reverts. Binary
 * pools are recycled across a series, so one approval covers every market that
 * pool later serves.
 *
 * The fee is clamped to the pool's own ceiling first. Approving or ordering
 * above it reverts `BuilderFeeExceedsCap` no matter what the wallet approves,
 * so the arena's nominal fee is the ask, and the pool's cap is the answer.
 * Every live Shannon pool caps it at 0, which means: no approval is needed,
 * the order still carries the arena as its builder, and nothing is charged.
 */
export function useArenaApproval(market: ArenaMarket | null) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { builder, builderFeeBpsTimes1k } = useActiveArena();
  const cap = usePoolBuilderFeeCap(market?.pool);

  const [approved, setApproved] = useState<boolean | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const arenaFee = builderFeeBpsTimes1k ?? 0n;
  /** The fee that can actually be charged on this pool — null until the cap is read. */
  const effectiveFee = cap === null ? null : effectiveBuilderFee(arenaFee, cap);
  /** The pool cannot carry the arena's nominal fee. */
  const capped = cap !== null && cap < arenaFee;
  const needed = Boolean(market && builder && effectiveFee && effectiveFee > 0n);

  const check = useCallback(async () => {
    if (!needed || !address || !market || !builder || !effectiveFee) {
      setApproved(null);
      return;
    }
    const allowance = await getArenaApproval(address, market.pool, builder);
    setApproved(allowance >= effectiveFee);
  }, [needed, address, market, builder, effectiveFee]);

  useEffect(() => {
    check();
  }, [check]);

  const approve = useCallback(async () => {
    if (!market || !builder || !effectiveFee) return;
    setApproving(true);
    setError(null);
    try {
      // Inside the try, so a wallet that cannot sign yet says so instead of
      // returning silently and leaving the button looking dead.
      const signer = requireSigner(walletClient, address);
      await approveArena(signer, market.pool, builder, effectiveFee);
      await check();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The approval did not go through');
      throw err;
    } finally {
      setApproving(false);
    }
  }, [walletClient, address, market, builder, effectiveFee, check]);

  return {
    needed,
    approved,
    approving,
    error,
    approve,
    builder,
    /** The arena's nominal fee. */
    builderFeeBpsTimes1k,
    /** The pool's ceiling; null while loading. */
    cap,
    /** What this bet will actually pay the arena; null while loading. */
    effectiveFee,
    capped,
  };
}
