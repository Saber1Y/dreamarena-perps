'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { Hourglass, Zap } from 'lucide-react';
import type { Address } from 'viem';
import { publicClient, needsSettlement, settleMarket } from '@/lib/dreamdex';
import { ARCADE_ENGINE_ABI } from '@/lib/abis';
import { CONTRACTS, isDeployed } from '@/lib/web3';
import { useToast } from '@/components/toast';

const ENGINE = CONTRACTS.arcadeEngine as Address;

interface Pending {
  marketId: `0x${string}`;
  up: boolean;
  settleable: boolean;
}

/**
 * Entries that have not settled yet, and a way to push the stuck ones through.
 *
 * Almost always this is empty: the reactive callback settles a market in the
 * block its oracle answers. But OracleHub does not emit `AnswerDelivered` for
 * every market it finalizes, and an entry whose callback never came would
 * otherwise sit unresolved forever. `settleMarket` is permissionless, so the
 * player can finish it themselves.
 */
export function PendingEntries() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { push } = useToast();
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!address || !isDeployed) {
      setPending([]);
      return;
    }
    try {
      const head = await publicClient.getBlockNumber();
      // This RPC caps getLogs at 1000 blocks; on Somnia that is a short window,
      // which is fine — a stuck entry is only worth surfacing while recent.
      const logs = await publicClient.getLogs({
        address: ENGINE,
        event: ARCADE_ENGINE_ABI.find(
          (a: any) => a.type === 'event' && a.name === 'EntryRecorded',
        ) as any,
        args: { player: address },
        fromBlock: head - 999n,
        toBlock: head,
      });

      const seen = new Map<string, boolean>();
      for (const log of logs as any[]) {
        const { marketId, up } = log.args ?? {};
        if (marketId) seen.set(marketId, Boolean(up));
      }

      const rows: Pending[] = [];
      for (const [marketId, up] of seen) {
        const entry = (await publicClient.readContract({
          address: ENGINE,
          abi: ARCADE_ENGINE_ABI,
          functionName: 'entries',
          args: [marketId as `0x${string}`, address],
        })) as readonly [boolean, bigint, boolean, boolean, number];

        const resolved = entry[2];
        if (resolved) continue;
        rows.push({
          marketId: marketId as `0x${string}`,
          up,
          settleable: await needsSettlement(marketId as `0x${string}`),
        });
      }
      setPending(rows);
    } catch {
      // A read failure here is not worth surfacing — the card simply stays empty.
    }
  }, [address]);

  useEffect(() => {
    scan();
    const id = setInterval(scan, 20_000);
    return () => clearInterval(id);
  }, [scan]);

  const settle = async (marketId: `0x${string}`) => {
    if (!walletClient) return;
    setBusy(marketId);
    try {
      await settleMarket(walletClient, marketId);
      push({ type: 'success', title: 'Settled', detail: 'Your streak is up to date' });
      await scan();
    } catch {
      push({ type: 'error', title: 'Could not settle', detail: 'The market may not be resolved yet' });
    } finally {
      setBusy(null);
    }
  };

  if (pending.length === 0) return null;

  return (
    <section className="surface p-6">
      <div className="flex items-center gap-2 mb-4">
        <Hourglass className="w-4 h-4 text-text-muted" />
        <h3 className="font-bold">Open bets</h3>
      </div>

      <div className="space-y-2">
        {pending.map((p) => (
          <div
            key={p.marketId}
            className="flex items-center justify-between gap-3 rounded-xl bg-elevated px-4 py-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{p.up ? 'UP' : 'DOWN'}</div>
              <div className="text-xs text-text-muted font-mono truncate">
                {p.marketId.slice(-8)}
              </div>
            </div>

            {p.settleable ? (
              <button
                onClick={() => settle(p.marketId)}
                disabled={busy === p.marketId}
                className="text-xs font-medium px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 disabled:opacity-50 shrink-0"
              >
                {busy === p.marketId ? 'Settling…' : 'Settle now'}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-text-muted shrink-0">
                <Zap className="w-3 h-3" /> awaiting the oracle
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-text-muted mt-3">
        These settle themselves the moment the oracle answers. “Settle now” is the
        manual catch-up for a market that finalized without emitting the event our
        subscription listens for.
      </p>
    </section>
  );
}
