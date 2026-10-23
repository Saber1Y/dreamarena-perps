'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Award, Crown, Flame, HeartPulse, Search, Skull, Sparkles, Target } from 'lucide-react';
import { isAddress } from 'viem';
import { useArena, useFeed } from '@/hooks/api';
import { useNow } from '@/hooks/useNow';
import { Avatar } from '@/components/Avatar';
import { FeedRow } from '@/components/FeedRow';
import type { StatsView } from '@/lib/types';
import { addrUrl, pnl, pnlTone, shortAddr } from '@/lib/format';

const ACHIEVEMENTS: { id: string; title: string; detail: string; icon: typeof Award; earned: (s: StatsView) => boolean }[] = [
  { id: 'first', title: 'First run', detail: 'Started a run on the arena.', icon: Sparkles, earned: (s) => s.runs >= 1 },
  { id: 'green', title: 'In the green', detail: 'Closed a trade in profit inside a run.', icon: Target, earned: (s) => s.winningTrades >= 1 },
  { id: 'survivor', title: 'Survivor', detail: 'Held a position to the deadline.', icon: HeartPulse, earned: (s) => s.survived >= 1 },
  { id: 'streak3', title: 'Hat trick', detail: 'Three profitable closes in a row.', icon: Flame, earned: (s) => s.bestStreak >= 3 },
  { id: 'boss', title: 'Boss down', detail: 'Won a Boss run outright.', icon: Crown, earned: (s) => s.bossesSlain >= 1 },
  { id: 'streak5', title: 'On fire', detail: 'Five profitable closes in a row.', icon: Award, earned: (s) => s.bestStreak >= 5 },
  { id: 'scar', title: 'Battle scar', detail: 'Got liquidated and came back.', icon: Skull, earned: (s) => s.liquidations >= 1 && s.runs >= 2 },
];

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={`num mt-0.5 text-xl font-semibold ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

export function ProfileTab({ player }: { player: string | null }) {
  const router = useRouter();
  const arena = useArena(player);
  const feed = useFeed();
  const now = useNow();
  const [query, setQuery] = useState('');
  const view = arena.data?.player ?? null;

  const events = useMemo(
    () => (feed.data?.events ?? []).filter((e) => view && e.player.toLowerCase() === view.address.toLowerCase()).slice(0, 12),
    [feed.data, view],
  );

  const lookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddress(query.trim())) router.push(`/app?tab=profile&player=${query.trim()}`);
  };

  return (
    <div className="space-y-5">
      <form onSubmit={lookup} className="flex max-w-xl gap-2" role="search">
        <label htmlFor="profile-search" className="sr-only">
          Look up a player by address
        </label>
        <input
          id="profile-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Look up any player: 0x…"
          className="input num"
          spellCheck={false}
        />
        <button type="submit" className="btn-secondary shrink-0 whitespace-nowrap" disabled={!isAddress(query.trim())}>
          <Search className="h-4 w-4" /> Look up
        </button>
      </form>

      {arena.isLoading && <div className="surface skeleton h-56" />}
      {arena.error && <p className="surface p-5 text-sm text-danger">Could not read this player: {arena.error.message}</p>}
      {!arena.isLoading && !view && !arena.error && (
        <p className="surface p-5 text-sm text-text-muted">Enter an address to see a player&apos;s on-chain record.</p>
      )}

      {view && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <section className="surface p-5" aria-label="Player card">
            <div className="flex items-center gap-4">
              <Avatar address={view.address} size={64} className="rounded-2xl" />
              <div className="min-w-0">
                <a href={addrUrl(view.address)} target="_blank" rel="noopener noreferrer" className="num block truncate text-lg font-semibold hover:text-primary">
                  {shortAddr(view.address)}
                </a>
                <p className="text-xs text-text-muted">
                  {view.run.status === 'Active'
                    ? `In a ${view.run.game} run on ${view.run.symbol}`
                    : view.stats.runs === 0
                      ? 'No runs on this arena yet'
                      : `${view.stats.runs} run${view.stats.runs === 1 ? '' : 's'} played`}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-4 border-t border-border pt-5">
              <Stat label="Best streak" value={String(view.stats.bestStreak)} />
              <Stat label="Survived" value={String(view.stats.survived)} />
              <Stat label="Bosses" value={String(view.stats.bossesSlain)} />
              <Stat label="Closes won" value={`${view.stats.winningTrades}/${view.stats.closedTrades}`} />
              <Stat label="Liquidations" value={String(view.stats.liquidations)} />
              <Stat label="Realized" value={pnl(view.stats.realizedPnl)} tone={pnlTone(view.stats.realizedPnl)} />
            </div>
            <p className="mt-4 text-[11px] text-text-muted">Every number is kept by the arena contract, moved only by Reactivity callbacks.</p>
          </section>

          <section className="surface p-5" aria-label="Achievements">
            <h2 className="text-lg font-semibold">Achievements</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {ACHIEVEMENTS.map(({ id, title, detail, icon: Icon, earned }) => {
                const on = earned(view.stats);
                return (
                  <li key={id} className={`flex items-start gap-3 rounded-xl border p-3 ${on ? 'tint-primary border-transparent' : 'border-dashed border-border-default'}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-primary text-white' : 'bg-elevated text-text-muted'}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className={`block text-sm font-semibold ${on ? '' : 'text-text-muted'}`}>{title}</span>
                      <span className="block text-xs text-text-muted">{detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="surface p-5 lg:col-span-2" aria-label="Recent activity">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">Nothing in the last hour.</p>
            ) : (
              <ul className="mt-1 divide-y divide-[var(--border-subtle)]">
                {events.map((e) => (
                  <FeedRow key={e.id} e={e} showPlayer={false} now={now} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
