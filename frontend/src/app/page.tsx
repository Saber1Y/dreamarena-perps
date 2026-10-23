'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Bot, Flame, Github, ShieldCheck, Swords, Timer, Zap } from 'lucide-react';
import { LogoText } from '@/components/Logo';
import { FeedRow } from '@/components/FeedRow';
import { RollingNumber } from '@/components/RollingNumber';
import { useArena, useFeed } from '@/hooks/api';
import { useNow } from '@/hooks/useNow';
import { addrUrl, shortAddr, usd } from '@/lib/format';

const REPO = 'https://github.com/Saber1Y/dreamarena-perps';

const rise = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { type: 'spring' as const, stiffness: 260, damping: 30 },
};

function LiveCard() {
  const arena = useArena();
  const feed = useFeed();
  const now = useNow();
  const a = arena.data?.arena;
  const recent = (feed.data?.events ?? []).slice(0, 3);

  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Live arena
        </span>
        {a && (
          <a href={addrUrl(a.address)} target="_blank" rel="noopener noreferrer" className="num text-[11px] text-text-muted hover:text-primary">
            {shortAddr(a.address)}
          </a>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 px-5 py-4">
        <div>
          <p className="eyebrow">Callbacks</p>
          <p className="num text-2xl font-semibold">{a ? <RollingNumber value={a.callbacks} decimals={0} /> : '–'}</p>
        </div>
        <div>
          <p className="eyebrow">Players</p>
          <p className="num text-2xl font-semibold">{a ? a.playerCount : '–'}</p>
        </div>
        <div>
          <p className="eyebrow">In a run</p>
          <p className="num text-2xl font-semibold">{a ? a.activeRuns : '–'}</p>
        </div>
      </div>
      <div className="border-t border-border px-5">
        {feed.isLoading && <div className="skeleton my-4 h-16 w-full" />}
        {feed.data && recent.length === 0 && (
          <p className="py-4 text-xs text-text-muted">No callbacks in the last hour. The next run that trades will show up here.</p>
        )}
        <ul className="divide-y divide-[var(--border-subtle)]">
          {recent.map((e) => (
            <FeedRow key={e.id} e={e} now={now} />
          ))}
        </ul>
      </div>
      {a && (
        <p className="num border-t border-border bg-elevated px-5 py-2 text-[11px] text-text-muted">
          Somnia Tokyo testnet · head {a.head.toLocaleString('en-US')} · Reactivity balance {usd(a.balanceStt, 2)} STT
        </p>
      )}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh]">
      <header className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 lg:px-6">
        <LogoText />
        <nav className="flex items-center gap-2">
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="btn-ghost hidden sm:inline-flex">
            <Github className="h-4 w-4" /> Source
          </a>
          <Link href="/app" className="btn-primary">
            Open the arena <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-20 pt-10 lg:grid-cols-[1.15fr_1fr] lg:px-6 lg:pt-16">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 28 }}>
            <span className="badge-primary">dreamDEX perps · Somnia Reactivity</span>
            <h1 className="mt-5 text-[2.6rem] font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
              Leverage challenges the chain referees.
            </h1>
            <p className="mt-5 max-w-[52ch] text-base text-text-secondary sm:text-lg">
              Trade real dreamDEX perps and take on Survivor, Streak and Boss runs. The arena contract subscribes to your own position events, and Somnia calls it in the block your position changes. No keeper, no backend, no score anyone can fake.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/app" className="btn-primary px-6 py-3">
                Start a run <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/app?tab=monitor" className="btn-secondary px-6 py-3">
                Watch callbacks land
              </Link>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 28, delay: 0.08 }}>
            <LiveCard />
          </motion.div>
        </section>

        {/* Games */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-[1200px] px-4 py-20 lg:px-6">
            <motion.div {...rise} className="max-w-[56ch]">
              <p className="eyebrow">Three runs</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Pick a fight with the market.</h2>
            </motion.div>
            <div className="mt-10 grid gap-4 lg:grid-cols-[1.25fr_1fr] lg:grid-rows-2">
              <motion.article {...rise} className="surface-elevated flex flex-col justify-between p-7 lg:row-span-2">
                <div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
                    <Timer className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-2xl font-bold">Survivor</h3>
                  <p className="mt-2 max-w-[44ch] text-text-secondary">
                    Open a position, start the clock, and keep it alive for 5 minutes, 15 minutes or an hour. A liquidation or a full close loses.
                  </p>
                </div>
                <div className="mt-8 rounded-xl bg-surface p-4">
                  <p className="eyebrow">Who ends the run</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    A scheduled Reactivity callback, set when the run starts, fires at the deadline second and checks your position on-chain.
                  </p>
                </div>
              </motion.article>
              <motion.article {...rise} className="surface-elevated p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-text-primary text-background">
                    <Flame className="h-5 w-5" />
                  </span>
                  <h3 className="text-xl font-bold">Streak</h3>
                </div>
                <p className="mt-3 text-text-secondary">Close in profit, again and again. The first losing close ends the run and your best streak goes on the board.</p>
              </motion.article>
              <motion.article {...rise} className="surface-elevated p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger text-white">
                    <Swords className="h-5 w-5" />
                  </span>
                  <h3 className="text-xl font-bold">Boss</h3>
                </div>
                <p className="mt-3 text-text-secondary">Three profitable closes in a row beat the boss. One losing close and the boss wins.</p>
              </motion.article>
            </div>
          </div>
        </section>

        {/* How it is scored */}
        <section className="mx-auto max-w-[1200px] px-4 py-20 lg:px-6">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
            <motion.div {...rise}>
              <p className="eyebrow">How a score lands</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">The trade and the score share a block.</h2>
              <p className="mt-4 max-w-[48ch] text-text-secondary">
                Every run opens its own subscriptions, filtered to one player and one market, so the arena pays only for players in a run, not for the thousands of position changes MarginBank emits each hour.
              </p>
            </motion.div>
            <ol className="space-y-4">
              {[
                { icon: Zap, title: 'You trade', body: 'A real order fills on the dreamDEX perp pool. MarginBank emits PositionUpdated for your account.' },
                { icon: ShieldCheck, title: 'The chain calls the arena', body: 'Somnia’s Reactivity precompile matches your subscription and calls PerpsArena in that same block.' },
                { icon: Flame, title: 'The run moves', body: 'The arena sums the realized PnL from open to flat, scores the close, and updates your streak, boss or survival on-chain.' },
              ].map(({ icon: Icon, title, body }, i) => (
                <motion.li key={title} {...rise} transition={{ ...rise.transition, delay: i * 0.06 }} className="surface flex gap-4 p-5">
                  <span className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-sm font-semibold text-primary">{i + 1}</span>
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold">
                      <Icon className="h-4 w-4 text-primary" /> {title}
                    </h3>
                    <p className="mt-1 text-sm text-text-secondary">{body}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </section>

        {/* The agent */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-20 lg:grid-cols-[1fr_1fr] lg:px-6">
            <motion.div {...rise}>
              <p className="eyebrow">The agent</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">An AI that trades your wallet and cannot withdraw from it.</h2>
              <p className="mt-4 max-w-[50ch] text-text-secondary">
                The perps agent is an MCP server. Link its key to your Perps Arena wallet with dreamDEX Link a Bot and it can place, cancel and reduce orders for you. Its limits run in code: allowed markets, order size, leverage, and reduce-only after a set loss.
              </p>
              <Link href="/app?tab=agent" className="btn-secondary mt-6">
                <Bot className="h-4 w-4" /> See the agent&apos;s tools
              </Link>
            </motion.div>
            <motion.figure {...rise}>
            <pre className="num overflow-x-auto rounded-2xl bg-text-primary p-6 text-[12px] leading-relaxed text-background">
{`> dreamarena_preview_order ETH long 25
  quantity      0.0105 ETH
  leverage      0.03x after fill
  allowed       true

> dreamarena_open_position ETH long 25
  filled        0.0105 ETH
  position      long 0.0105

> dreamarena_open_position DOGE long 25
  refused       DOGE is not in this agent's
                allowed markets (BTC, ETH, SOL)`}
            </pre>
            <figcaption className="mt-2 text-xs text-text-muted">
              An example session, abridged. Run the real tools in the app&apos;s Agent tab.
            </figcaption>
            </motion.figure>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-10 text-xs text-text-muted lg:px-6">
        <p>Built for the dreamDEX Perps Builder Bounty. Testnet only: paper USDso, no real funds.</p>
        <div className="flex gap-4">
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="hover:text-text-primary">Source</a>
          <Link href="/app?tab=leaderboard" className="hover:text-text-primary">Leaderboard</Link>
          <Link href="/app?tab=monitor" className="hover:text-text-primary">Monitor</Link>
        </div>
      </footer>
    </div>
  );
}
