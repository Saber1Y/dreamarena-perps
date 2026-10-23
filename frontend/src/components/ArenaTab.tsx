'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Flame, Lock, ShieldCheck, Swords, Timer } from 'lucide-react';
import { useAccount, useAgentStatus, useArena, useFeed, useMarket, usePreview, useRunAction, useSession, useTrade } from '@/hooks/api';
import { useNow } from '@/hooks/useNow';
import { useToast } from '@/components/toast';
import { FeedRow } from '@/components/FeedRow';
import { BOSS_ROUNDS, SURVIVAL_CHOICES, type AccountView, type GameName, type PlayerView, type Position } from '@/lib/types';
import { countdown, pnl, pnlTone, price, usd } from '@/lib/format';

const GAME_COPY: Record<GameName, { title: string; rule: string; needs: string; icon: typeof Timer }> = {
  Survivor: {
    title: 'Survivor',
    rule: 'Keep an open position alive until the deadline. A liquidation or a full close loses.',
    needs: 'Starts from an open position in the market.',
    icon: Timer,
  },
  Streak: {
    title: 'Streak',
    rule: 'Every round trip that closes in profit adds a win. The first losing close ends the run.',
    needs: 'Starts flat in the market.',
    icon: Flame,
  },
  Boss: {
    title: 'Boss',
    rule: `Land ${BOSS_ROUNDS} profitable closes in a row to beat the boss. One loss and it wins.`,
    needs: 'Starts flat in the market.',
    icon: Swords,
  },
};

function useActions() {
  const session = useSession();
  return { unlocked: Boolean(session.data?.unlocked), configured: Boolean(session.data?.configured), known: Boolean(session.data) };
}

function LockedHint() {
  const { configured, known } = useActions();
  // Until the session is known, "read-only" would be a guess.
  if (!known) return <span className="skeleton block h-4 w-48" aria-hidden />;
  return (
    <p className="flex items-center gap-1.5 text-xs text-text-muted">
      <Lock className="h-3.5 w-3.5" />
      {configured ? 'Unlock the console (top right) to trade and start runs.' : 'This deployment is read-only.'}
    </p>
  );
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function SurvivorTrack({ startedAt, deadline, now }: { startedAt: number; deadline: number; now: number }) {
  const total = Math.max(1, deadline - startedAt);
  const left = Math.max(0, deadline - now / 1000);
  const done = 1 - left / total;
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow">Survive for</p>
          <p className="num text-5xl font-semibold tracking-tight">{countdown(left)}</p>
        </div>
        <p className="num text-xs text-text-muted">until {new Date(deadline * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-elevated">
        <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${Math.min(100, done * 100)}%` }} transition={{ ease: 'linear', duration: 1 }} />
      </div>
      <p className="mt-2 text-xs text-text-muted">
        {left > 0 ? 'A scheduled Reactivity callback settles this at the deadline. No keeper.' : 'Deadline reached. Waiting for the scheduled callback to land.'}
      </p>
    </div>
  );
}

function BossBar({ wins }: { wins: number }) {
  const hp = Math.max(0, BOSS_ROUNDS - wins);
  return (
    <div>
      <p className="eyebrow">Boss health</p>
      <div className="mt-2 flex gap-2">
        {Array.from({ length: BOSS_ROUNDS }, (_, i) => (
          <motion.span
            key={i}
            initial={false}
            animate={{ opacity: i < hp ? 1 : 0.18, scale: i < hp ? 1 : 0.92 }}
            className="h-3 flex-1 rounded-full bg-danger"
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-text-muted">
        {hp} of {BOSS_ROUNDS} left. Each profitable close lands a hit; a losing close ends the fight.
      </p>
    </div>
  );
}

function RunHero({ player, account, now }: { player: PlayerView | null; account: AccountView | undefined; now: number }) {
  const run = player?.run;
  const runAction = useRunAction();
  const toast = useToast();
  const { unlocked } = useActions();

  if (!player || !run || run.status === 'None') return <StartRun account={account} heading="Start a run" />;

  const active = run.status === 'Active';
  const position = account?.positions.find((p) => p.symbol === run.symbol);

  if (!active) {
    const tone = run.status === 'Won' ? 'tint-success' : run.status === 'Lost' ? 'tint-danger' : '';
    return (
      <div className="space-y-4">
        <div className={`surface-flat flex flex-wrap items-center justify-between gap-3 border p-5 ${tone}`}>
          <div>
            <p className="eyebrow">Last run</p>
            <p className="mt-1 text-lg font-semibold">
              {run.game} on {run.symbol ?? 'a market'}: {run.status === 'Won' ? 'won' : run.status === 'Lost' ? 'lost' : 'ended'}
              {run.game !== 'Survivor' && ` with ${run.wins} win${run.wins === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="text-right">
            <p className="eyebrow">Run PnL</p>
            <p className={`num text-lg font-semibold ${pnlTone(run.runPnl)}`}>{pnl(run.runPnl)} USDso</p>
          </div>
        </div>
        <StartRun account={account} heading="Start another run" />
      </div>
    );
  }

  const Icon = run.game ? GAME_COPY[run.game].icon : Swords;
  return (
    <section className="surface overflow-hidden" aria-label="Current run">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="tint-primary flex h-8 w-8 items-center justify-center rounded-lg text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">
              {run.game} · {run.symbol}
            </p>
            <p className="text-[11px] text-text-muted">Started {new Date(run.startedAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
        <span className="badge-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-fast" /> Live on-chain
        </span>
      </div>

      <div className="grid gap-6 p-5 sm:grid-cols-[1.4fr_1fr]">
        <div>
          {run.game === 'Survivor' && <SurvivorTrack startedAt={run.startedAt} deadline={run.deadline} now={now} />}
          {run.game === 'Streak' && (
            <div>
              <p className="eyebrow">Winning closes in a row</p>
              <p className="num text-6xl font-semibold tracking-tight">{run.wins}</p>
              <p className="mt-2 text-xs text-text-muted">Best ever: {player.stats.bestStreak}. The first losing close ends the run.</p>
            </div>
          )}
          {run.game === 'Boss' && <BossBar wins={run.wins} />}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-1">
          <div title="Realized so far on the trade that is open now">
            <dt className="eyebrow">Trade PnL</dt>
            <dd className={`num font-semibold ${pnlTone(run.tradePnl)}`}>{pnl(run.tradePnl)}</dd>
          </div>
          <div title="Realized across this run, before trading fees">
            <dt className="eyebrow">Run PnL</dt>
            <dd className={`num font-semibold ${pnlTone(run.runPnl)}`}>{pnl(run.runPnl)}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="eyebrow">Position</dt>
            <dd className="num text-sm">
              {position ? (
                <span className={position.side === 'long' ? 'text-success' : 'text-danger'}>
                  {position.side} {position.size} · uPnL <span className={pnlTone(position.unrealizedPnlUsdso)}>{pnl(position.unrealizedPnlUsdso)}</span>
                </span>
              ) : (
                <span className="text-text-muted">flat</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-elevated px-5 py-3">
        {unlocked ? (
          <p className="text-xs text-text-muted">Trade below; the arena scores every change itself.</p>
        ) : (
          <LockedHint />
        )}
        <button
          className="btn-ghost shrink-0 whitespace-nowrap text-xs"
          disabled={!unlocked || runAction.isPending}
          onClick={() =>
            runAction.mutate(
              { action: 'end' },
              {
                onSuccess: (r) => toast.push({ type: 'success', title: 'Run ended', detail: 'Wins so far are kept.', href: r.explorer }),
                onError: (e) => toast.push({ type: 'error', title: 'Could not end the run', detail: e.message }),
              },
            )
          }
        >
          {runAction.isPending ? 'Ending…' : 'End run'}
        </button>
      </div>
    </section>
  );
}

function StartRun({ account, heading }: { account: AccountView | undefined; heading: string }) {
  const status = useAgentStatus();
  const markets = status.data?.limits.markets ?? [];
  const [game, setGame] = useState<GameName>('Streak');
  const [symbol, setSymbol] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(SURVIVAL_CHOICES[0].seconds);
  const runAction = useRunAction();
  const toast = useToast();
  const { unlocked } = useActions();

  const chosen = symbol ?? markets[0] ?? null;
  const position = account?.positions.find((p) => p.symbol === chosen);
  const ready = game === 'Survivor' ? Boolean(position) : !position;
  const why =
    game === 'Survivor'
      ? position
        ? `Your ${position.side} ${position.size} ${chosen} will have to survive.`
        : `Open a position in ${chosen ?? 'the market'} first, then start.`
      : position
        ? `Close your ${chosen} position first: the run starts flat.`
        : `You are flat in ${chosen ?? 'the market'}. Ready.`;

  return (
    <section className="surface p-5" aria-label={heading}>
      <h2 className="text-lg font-semibold">{heading}</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-text-secondary">
        Pick a challenge. Somnia Reactivity watches your own MarginBank events and scores the run in the block your position changes.
      </p>

      <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Game">
        {(Object.keys(GAME_COPY) as GameName[]).map((g) => {
          const { title, rule, icon: Icon } = GAME_COPY[g];
          const on = g === game;
          return (
            <button
              key={g}
              role="radio"
              aria-checked={on}
              onClick={() => setGame(g)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color] ${on ? 'tint-primary border-primary' : 'border-border hover:bg-elevated'}`}
            >
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-primary text-white' : 'bg-elevated text-text-secondary'}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-text-secondary">{rule}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="eyebrow mb-1.5">Market</p>
          <div className="flex flex-wrap gap-1.5">
            {markets.length === 0 && <span className="skeleton h-8 w-32" />}
            {markets.map((m) => (
              <button
                key={m}
                onClick={() => setSymbol(m)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${m === chosen ? 'bg-text-primary text-background' : 'bg-elevated text-text-secondary hover:text-text-primary'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {game === 'Survivor' && (
          <div>
            <p className="eyebrow mb-1.5">Survive for</p>
            <div className="flex gap-1.5">
              {SURVIVAL_CHOICES.map((c) => (
                <button
                  key={c.seconds}
                  onClick={() => setSeconds(c.seconds)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${c.seconds === seconds ? 'bg-text-primary text-background' : 'bg-elevated text-text-secondary hover:text-text-primary'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className={`text-xs ${ready ? 'text-success' : 'text-text-muted'}`}>{why}</p>
        {unlocked ? (
          <button
            className="btn-primary"
            disabled={!chosen || !ready || runAction.isPending}
            onClick={() =>
              chosen &&
              runAction.mutate(
                { action: 'start', game, symbol: chosen, survivalSeconds: game === 'Survivor' ? seconds : undefined },
                {
                  onSuccess: (r) => toast.push({ type: 'reactive', title: `${game} run started`, detail: 'Subscriptions are live for your wallet.', href: r.explorer }),
                  onError: (e) => toast.push({ type: 'error', title: 'Could not start the run', detail: e.message }),
                },
              )
            }
          >
            {runAction.isPending ? 'Opening subscriptions…' : `Start ${game}`}
          </button>
        ) : (
          <LockedHint />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

const PRESETS = [10, 25, 50];

/** Defaults to the active run's market, so the first trade lands where the run is listening. */
function TradeTicket({ runSymbol }: { runSymbol: string | null }) {
  const status = useAgentStatus();
  const markets = status.data?.limits.markets ?? [];
  const [symbol, setSymbol] = useState<string | null>(null);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [amount, setAmount] = useState('25');
  const chosen = symbol ?? (runSymbol && markets.includes(runSymbol) ? runSymbol : null) ?? markets[0] ?? null;
  const notional = Number(amount);
  const market = useMarket(chosen);
  const preview = usePreview(chosen, side, Number.isFinite(notional) && notional > 0 ? notional : 0);
  const trade = useTrade();
  const toast = useToast();
  const { unlocked } = useActions();

  const sideButton = (s: 'long' | 'short') => {
    const on = side === s;
    const Icon = s === 'long' ? ArrowUpRight : ArrowDownRight;
    const tone = s === 'long' ? 'tint-success text-success border-transparent' : 'tint-danger text-danger border-transparent';
    return (
      <button
        onClick={() => setSide(s)}
        aria-pressed={on}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-semibold capitalize transition-colors ${on ? tone : 'border-border text-text-secondary hover:bg-elevated'}`}
      >
        <Icon className="h-4 w-4" /> {s}
      </button>
    );
  };

  return (
    <section className="surface p-5" aria-label="Trade">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Trade</h2>
        <span className="badge-muted" title="Orders go through the perps agent's planner and limits.">
          <ShieldCheck className="h-3 w-3" /> agent limits
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {markets.length === 0 && <span className="skeleton h-8 w-40" />}
        {markets.map((m) => (
          <button
            key={m}
            onClick={() => setSymbol(m)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${m === chosen ? 'bg-text-primary text-background' : 'bg-elevated text-text-secondary hover:text-text-primary'}`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-elevated px-4 py-3 text-sm">
        <div>
          <p className="eyebrow">Mark</p>
          <p className="num font-semibold">{market.data ? price(market.data.markPrice) : <span className="skeleton inline-block h-4 w-20" />}</p>
        </div>
        <div>
          <p className="eyebrow">Spread</p>
          <p className="num font-semibold">{market.data ? (market.data.spreadBps === null ? '–' : `${market.data.spreadBps} bps`) : <span className="skeleton inline-block h-4 w-12" />}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">{sideButton('long')}{sideButton('short')}</div>

      <label htmlFor="notional" className="eyebrow mt-4 block">
        Size, USDso notional
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="notional"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          className="input num"
        />
        {PRESETS.map((p) => (
          <button key={p} onClick={() => setAmount(String(p))} className="btn-secondary px-3 text-xs">
            {p}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-[72px] rounded-xl border border-border p-3 text-xs">
        {preview.isFetching && !preview.data && <div className="skeleton h-12 w-full" />}
        {preview.error && <p className="text-danger">{preview.error.message}</p>}
        {preview.data && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <dt className="text-text-muted">Quantity</dt>
            <dd className="num text-right">{preview.data.quantity} {preview.data.market}</dd>
            <dt className="text-text-muted">Worst price (IOC)</dt>
            <dd className="num text-right">{price(preview.data.limitPrice)}</dd>
            <dt className="text-text-muted">Account leverage after</dt>
            <dd className="num text-right">{preview.data.projectedAccountLeverage}x</dd>
            <dt className="text-text-muted">Liquidation price</dt>
            <dd className="num text-right">{preview.data.projectedLiquidationPrice === null ? 'none at this size' : price(preview.data.projectedLiquidationPrice)}</dd>
            {preview.data.refusal && <dd className="col-span-2 mt-1 font-medium text-danger">{preview.data.refusal}</dd>}
          </dl>
        )}
      </div>

      <div className="mt-4">
        {unlocked ? (
          <button
            className="btn-primary w-full"
            disabled={!chosen || !(notional > 0) || trade.isPending || preview.data?.allowed === false}
            onClick={() =>
              chosen &&
              trade.mutate(
                { action: 'open', symbol: chosen, side, notionalUsdso: notional },
                {
                  onSuccess: (r) =>
                    toast.push({
                      type: 'success',
                      title: `${side === 'long' ? 'Long' : 'Short'} ${r.filled} ${chosen} filled`,
                      detail: `Now ${r.positionAfter.side} ${r.positionAfter.size}`,
                      href: r.explorer,
                    }),
                  onError: (e) => toast.push({ type: 'error', title: 'Order not placed', detail: e.message }),
                },
              )
            }
          >
            {trade.isPending ? 'Sending…' : `${side === 'long' ? 'Long' : 'Short'} ${chosen ?? ''}`}
          </button>
        ) : (
          <LockedHint />
        )}
      </div>
    </section>
  );
}

function PositionRow({ p }: { p: Position }) {
  const trade = useTrade();
  const toast = useToast();
  const { unlocked } = useActions();
  const close = (percent: number) =>
    trade.mutate(
      { action: 'close', symbol: p.symbol, percent },
      {
        onSuccess: (r) => toast.push({ type: 'success', title: `Closed ${r.filled} ${p.symbol}`, detail: `Realized ${pnl(r.realizedPnlUsdso)} USDso`, href: r.explorer }),
        onError: (e) => toast.push({ type: 'error', title: 'Close failed', detail: e.message }),
      },
    );
  return (
    <li className="grid grid-cols-2 items-center gap-3 py-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <div>
        <p className="text-sm font-semibold">
          {p.symbol} <span className={p.side === 'long' ? 'text-success' : 'text-danger'}>{p.side}</span>
        </p>
        <p className="num text-xs text-text-muted">{p.size} @ {price(p.entryPrice)}</p>
      </div>
      <div className="text-right sm:text-left">
        <p className="eyebrow">uPnL</p>
        <p className={`num text-sm font-semibold ${pnlTone(p.unrealizedPnlUsdso)}`}>{pnl(p.unrealizedPnlUsdso)}</p>
      </div>
      <div>
        <p className="eyebrow">Liq.</p>
        <p className="num text-sm">{p.liquidationPrice === null ? 'none' : price(p.liquidationPrice)}</p>
      </div>
      <div className="flex justify-end gap-1.5">
        <button className="btn-secondary px-3 py-1.5 text-xs" disabled={!unlocked || trade.isPending} onClick={() => close(50)}>
          Close 50%
        </button>
        <button className="btn-secondary px-3 py-1.5 text-xs" disabled={!unlocked || trade.isPending} onClick={() => close(100)}>
          Close
        </button>
      </div>
    </li>
  );
}

function Positions({ account, loading, error }: { account: AccountView | undefined; loading: boolean; error: Error | null }) {
  return (
    <section className="surface p-5" aria-label="Positions">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Positions</h2>
        {account && (
          <p className="num text-xs text-text-muted">
            equity {usd(account.equityUsdso)} USDso · leverage {account.leverage.toFixed(2)}x
            {account.reduceOnly && <span className="badge-danger ml-2">loss limit hit: reduce-only</span>}
          </p>
        )}
      </div>
      {loading && <div className="skeleton mt-4 h-14 w-full" />}
      {!account && error && (
        <p className="mt-3 text-sm text-danger">Could not read the account: {error.message} Retrying.</p>
      )}
      {account && account.positions.length === 0 && (
        <p className="mt-3 text-sm text-text-muted">Flat everywhere. Open a position from the ticket.</p>
      )}
      {account && account.positions.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--border-subtle)]">
          {account.positions.map((p) => (
            <PositionRow key={p.symbol} p={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

export function ArenaTab() {
  const arena = useArena();
  const account = useAccount();
  const feed = useFeed();
  const now = useNow();
  const owner = arena.data?.player?.address;
  const mine = useMemo(
    () => (feed.data?.events ?? []).filter((e) => owner && e.player.toLowerCase() === owner.toLowerCase()).slice(0, 8),
    [feed.data, owner],
  );

  if (arena.error) {
    return <p className="surface p-5 text-sm text-danger">Could not read the arena: {arena.error.message}</p>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {arena.isLoading ? <div className="surface h-72 skeleton" /> : <RunHero player={arena.data?.player ?? null} account={account.data} now={now} />}
        <Positions account={account.data} loading={account.isLoading} error={account.error} />
        <section className="surface p-5" aria-label="Your run on-chain">
          <h2 className="text-lg font-semibold">Your run, on-chain</h2>
          <p className="mt-1 text-sm text-text-secondary">Every row comes from the arena contract. Callbacks show the trade that fired them and the block they share.</p>
          <AnimatePresence initial={false}>
            {!feed.data || !owner ? (
              // Until both the feed and the player are known, "nothing yet" would be a guess.
              <div className="mt-3 space-y-2">
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
              </div>
            ) : mine.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">Nothing yet in the last hour. Start a run and trade to see the chain call the arena.</p>
            ) : (
              <ul className="mt-1 divide-y divide-[var(--border-subtle)]">
                {mine.map((e) => (
                  <FeedRow key={e.id} e={e} showPlayer={false} now={now} />
                ))}
              </ul>
            )}
          </AnimatePresence>
        </section>
      </div>
      <div className="space-y-5 lg:sticky lg:top-32 lg:self-start">
        <TradeTicket runSymbol={arena.data?.player?.run.status === 'Active' ? arena.data.player.run.symbol : null} />
      </div>
    </div>
  );
}
