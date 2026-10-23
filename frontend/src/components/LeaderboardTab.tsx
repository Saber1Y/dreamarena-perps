'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useLeaderboard, useSession } from '@/hooks/api';
import { Avatar } from '@/components/Avatar';
import type { LeaderRow } from '@/lib/types';
import { pnl, pnlTone, shortAddr } from '@/lib/format';

/** Win rate only ranks players with enough closes for it to mean something. */
const MIN_CLOSES_FOR_RATE = 3;

const BOARDS = [
  {
    id: 'streak',
    label: 'Best streak',
    value: (r: LeaderRow) => r.stats.bestStreak,
    show: (r: LeaderRow) => `${r.stats.bestStreak}`,
    note: 'Most profitable closes in a row in one run.',
  },
  {
    id: 'survived',
    label: 'Survived',
    value: (r: LeaderRow) => r.stats.survived,
    show: (r: LeaderRow) => `${r.stats.survived}`,
    note: 'Survivor runs that made it to the deadline.',
  },
  {
    id: 'bosses',
    label: 'Bosses',
    value: (r: LeaderRow) => r.stats.bossesSlain,
    show: (r: LeaderRow) => `${r.stats.bossesSlain}`,
    note: 'Boss runs won outright.',
  },
  {
    id: 'rate',
    label: 'Win rate',
    value: (r: LeaderRow) => (r.stats.closedTrades >= MIN_CLOSES_FOR_RATE && r.winRate !== null ? r.winRate : -1),
    show: (r: LeaderRow) => (r.stats.closedTrades >= MIN_CLOSES_FOR_RATE && r.winRate !== null ? `${Math.round(r.winRate * 100)}%` : '–'),
    note: `Share of closes in profit, among players with ${MIN_CLOSES_FOR_RATE}+ closes.`,
  },
  {
    id: 'pnl',
    label: 'Realized PnL',
    value: (r: LeaderRow) => r.stats.realizedPnl,
    show: (r: LeaderRow) => pnl(r.stats.realizedPnl),
    note: 'USDso realized inside runs, before trading fees.',
  },
] as const;

export function LeaderboardTab() {
  const board = useLeaderboard();
  const session = useSession();
  const [id, setId] = useState<(typeof BOARDS)[number]['id']>('streak');
  const active = BOARDS.find((b) => b.id === id)!;

  const rows = useMemo(
    () => [...(board.data ?? [])].sort((a, b) => active.value(b) - active.value(a) || b.stats.runs - a.stats.runs),
    [board.data, active],
  );
  const me = session.data?.owner?.toLowerCase();

  return (
    <section className="surface overflow-hidden" aria-label="Leaderboard">
      <div className="flex flex-wrap items-end justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <p className="mt-1 text-sm text-text-secondary">{active.note} Read straight from the arena contract.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-elevated p-0.5" role="tablist" aria-label="Board">
          {BOARDS.map((b) => (
            <button
              key={b.id}
              role="tab"
              aria-selected={b.id === id}
              onClick={() => setId(b.id)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${b.id === id ? 'bg-surface text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {board.isLoading && (
        <div className="space-y-2 px-5 pb-5">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-12 w-full" />)}
        </div>
      )}
      {board.error && <p className="px-5 pb-5 text-sm text-danger">Could not read the leaderboard: {board.error.message}</p>}
      {board.data && rows.length === 0 && (
        <div className="border-t border-border px-5 py-10 text-center">
          <p className="text-sm font-semibold">No runs yet on this arena</p>
          <p className="mx-auto mt-1 max-w-[44ch] text-xs text-text-muted">The first player to start a run takes the top seat. Every stat here is kept on-chain by the arena.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="eyebrow px-5 py-2.5 font-semibold">#</th>
                <th className="eyebrow py-2.5 font-semibold">Player</th>
                <th className="eyebrow py-2.5 text-right font-semibold">{active.label}</th>
                <th className="eyebrow py-2.5 text-right font-semibold">Runs</th>
                <th className="eyebrow py-2.5 text-right font-semibold">Closes</th>
                <th className="eyebrow px-5 py-2.5 text-right font-semibold">PnL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const mine = r.address.toLowerCase() === me;
                return (
                  <motion.tr
                    key={r.address}
                    layout="position"
                    className={`border-t border-border ${mine ? 'tint-primary' : 'hover:bg-elevated'}`}
                  >
                    <td className="num px-5 py-3 text-text-muted">{i + 1}</td>
                    <td className="py-3">
                      <Link href={`/app?tab=profile&player=${r.address}`} className="flex items-center gap-2.5 hover:text-primary">
                        <Avatar address={r.address} size={28} className="rounded-lg" />
                        <span className="num">{shortAddr(r.address)}</span>
                        {mine && <span className="badge-primary">you</span>}
                        {r.run.status === 'Active' && <span className="badge-muted">in a run</span>}
                      </Link>
                    </td>
                    <td className="num py-3 text-right text-base font-semibold">{active.show(r)}</td>
                    <td className="num py-3 text-right text-text-secondary">{r.stats.runs}</td>
                    <td className="num py-3 text-right text-text-secondary">
                      {r.stats.winningTrades}/{r.stats.closedTrades}
                    </td>
                    <td className={`num px-5 py-3 text-right ${pnlTone(r.stats.realizedPnl)}`}>{pnl(r.stats.realizedPnl)}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
