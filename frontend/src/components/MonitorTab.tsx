'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { useArena, useFeed } from '@/hooks/api';
import { useNow } from '@/hooks/useNow';
import { FeedRow } from '@/components/FeedRow';
import { RollingNumber } from '@/components/RollingNumber';
import { addrUrl, shortAddr, usd } from '@/lib/format';

const FILTERS = [
  { id: 'all', label: 'Everything' },
  { id: 'callbacks', label: 'Callbacks' },
  { id: 'scores', label: 'Scores' },
] as const;

function Vital({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="py-1" title={hint}>
      <p className="eyebrow">{label}</p>
      <div className="num mt-1 text-2xl font-semibold tracking-tight">{children}</div>
    </div>
  );
}

export function MonitorTab() {
  const arena = useArena();
  const feed = useFeed();
  const now = useNow();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');

  const events = useMemo(() => {
    const all = feed.data?.events ?? [];
    if (filter === 'callbacks') return all.filter((e) => e.kind === 'Reacted');
    if (filter === 'scores') return all.filter((e) => e.kind === 'TradeScored' || e.kind === 'RunFinished' || e.kind === 'Liquidated');
    return all;
  }, [feed.data, filter]);

  const proven = useMemo(() => {
    const callbacks = (feed.data?.events ?? []).filter((e) => e.kind === 'Reacted' && e.trigger?.source !== 'Schedule');
    return { total: callbacks.length, same: callbacks.filter((e) => e.trigger?.sameBlock).length };
  }, [feed.data]);

  const a = arena.data?.arena;
  const headroom = a ? a.balanceStt - a.minimumStt : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-5 lg:sticky lg:top-32 lg:self-start">
        <section className="surface p-5" aria-label="Arena vitals">
          <h2 className="text-lg font-semibold">The arena contract</h2>
          {a ? (
            <a href={addrUrl(a.address)} target="_blank" rel="noopener noreferrer" className="num mt-1 inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary">
              {shortAddr(a.address)} <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="skeleton mt-2 block h-4 w-32" />
          )}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <Vital label="Callbacks received" hint="Every time the chain called onEvent on the arena.">
              {a ? <RollingNumber value={a.callbacks} decimals={0} /> : '–'}
            </Vital>
            <Vital label="Active runs">{a ? a.activeRuns : '–'}</Vital>
            <Vital label="Players">{a ? a.playerCount : '–'}</Vital>
            <Vital label="Same-block" hint="Position callbacks in the feed window whose trade sits in the callback's own block.">
              {proven.total ? `${proven.same}/${proven.total}` : '–'}
            </Vital>
          </div>
          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">Reactivity balance</p>
              <p className="num text-xs text-text-secondary">{a ? `${usd(a.balanceStt, 4)} STT` : ''}</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated">
              <div
                className={`h-full rounded-full ${headroom < 0.25 ? 'bg-warning' : 'bg-primary'}`}
                style={{ width: `${a ? Math.min(100, Math.max(2, (headroom / 2) * 100)) : 0}%` }}
              />
            </div>
            {a ? (
              <p className="mt-2 text-xs text-text-muted">
                {usd(headroom, 3)} STT above the {a.minimumStt} STT Reactivity needs to open subscriptions. Callbacks cost 0.0007 to 0.0045 STT each.
              </p>
            ) : (
              <span className="skeleton mt-2 block h-8 w-full" aria-hidden />
            )}
          </div>
        </section>

        <section className="surface-flat p-5 text-sm" aria-label="How scoring works">
          <h2 className="font-semibold">How a score lands</h2>
          <ol className="mt-3 space-y-3 text-text-secondary">
            <li><span className="num mr-2 text-primary">1</span>A run subscribes to the player&apos;s own MarginBank events for one market.</li>
            <li><span className="num mr-2 text-primary">2</span>A trade changes the position; MarginBank emits PositionUpdated.</li>
            <li><span className="num mr-2 text-primary">3</span>The Reactivity precompile calls the arena in that same block, and it scores the change.</li>
          </ol>
        </section>
      </div>

      <section className="surface p-5" aria-label="Live feed">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Live from the chain</h2>
            <p className="text-xs text-text-muted">
              {feed.data ? `Blocks ${feed.data.fromBlock.toLocaleString('en-US')} to ${feed.data.head.toLocaleString('en-US')}, refreshed every 3 seconds.` : 'Reading the arena’s recent events…'}
            </p>
          </div>
          <div className="flex rounded-lg bg-elevated p-0.5" role="tablist" aria-label="Filter">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${filter === f.id ? 'bg-surface text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {feed.isLoading && (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-12 w-full" />)}
          </div>
        )}
        {feed.error && <p className="mt-4 text-sm text-danger">Could not read the feed: {feed.error.message}</p>}
        {feed.data && events.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-border-default p-6 text-center">
            <p className="text-sm font-semibold">Quiet for the last hour</p>
            <p className="mx-auto mt-1 max-w-[46ch] text-xs text-text-muted">
              The arena only hears from players in a run. Start one in the Arena tab and trade; each position change shows up here within a few seconds.
            </p>
          </div>
        )}
        <AnimatePresence initial={false}>
          <ul className="mt-1 divide-y divide-[var(--border-subtle)]">
            {events.map((e) => (
              <FeedRow key={e.id} e={e} now={now} />
            ))}
          </ul>
        </AnimatePresence>
      </section>
    </div>
  );
}
