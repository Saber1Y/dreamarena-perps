'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Activity, Bot, Swords, Trophy, User, type LucideIcon } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ConsoleLock } from '@/components/ConsoleLock';
import { useArena } from '@/hooks/api';
import { usd } from '@/lib/format';

export const TABS = ['arena', 'agent', 'leaderboard', 'profile', 'monitor'] as const;
export type Tab = (typeof TABS)[number];

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'arena', label: 'Arena', icon: Swords },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'monitor', label: 'Monitor', icon: Activity },
];

/** Reactivity needs the arena to hold this much; callbacks spend from it. */
function ArenaFuel() {
  const { data } = useArena();
  if (!data) return <div className="skeleton hidden h-8 w-36 sm:block" aria-hidden />;
  const { balanceStt, minimumStt } = data.arena;
  const headroom = balanceStt - minimumStt;
  const low = headroom < 0.25;
  return (
    <div
      className={`hidden items-center gap-2 rounded-lg border px-3 py-1.5 sm:flex ${low ? 'tint-warning' : 'border-border bg-surface'}`}
      title={`The arena holds ${usd(balanceStt, 4)} STT. Reactivity needs ${minimumStt} STT to open subscriptions, and each callback costs 0.0007 to 0.0045 STT.`}
    >
      <span className="eyebrow">Reactivity</span>
      <span className={`num text-xs font-semibold ${low ? 'text-warning' : 'text-text-primary'}`}>{usd(headroom, 3)} STT</span>
    </div>
  );
}

export function AppShell({ tab, onTab, children }: { tab: Tab; onTab: (t: Tab) => void; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-[var(--z-nav)] border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-text-primary" aria-label="DreamArena Perps home">
              <Logo className="h-7 w-7" />
              <span className="hidden text-sm font-bold tracking-tight sm:inline">DreamArena</span>
              <span className="badge-primary hidden sm:inline-flex">Perps</span>
            </Link>
            <span className="hidden h-5 w-px bg-border md:block" />
            <span className="hidden items-center gap-2 text-xs font-medium text-text-secondary md:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Somnia Tokyo testnet
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ArenaFuel />
            <ConsoleLock />
          </div>
        </div>

        {/* Desktop tabs */}
        <nav className="mx-auto hidden max-w-[1200px] px-4 md:block lg:px-6" aria-label="Sections">
          <div className="flex gap-1">
            {NAV.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => onTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-2 px-3 pb-3 pt-1 text-sm font-semibold transition-colors ${active ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-primary' : ''}`} />
                  {label}
                  {active && (
                    <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-28 pt-6 md:pb-12 lg:px-6">
        {children}
      </main>

      {/* Mobile deck */}
      <nav
        className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="Sections"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-1 py-1.5">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => onTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-colors ${active ? 'text-primary' : 'text-text-muted'}`}
              >
                <Icon className="h-5 w-5" />
                <span className={`max-w-full truncate text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
