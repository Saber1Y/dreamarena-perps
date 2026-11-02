'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Flame, Fuel, Lock, ShieldCheck, Swords, Timer, Wallet } from 'lucide-react';
import {
  useAccount,
  useActor,
  useAgentStatus,
  useArena,
  useFeed,
  useMarket,
  usePreview,
  useRunAction,
  useSession,
  useSttBalance,
  useTrade,
  type Actor,
} from '@/hooks/api';
import { useNow } from '@/hooks/useNow';
import { useToast } from '@/components/toast';
import { FeedRow } from '@/components/FeedRow';
import { BOSS_ROUNDS, SURVIVAL_CHOICES, type AccountView, type ArenaView, type GameName, type PlayerView, type Position } from '@/lib/types';
import { countdown, pnl, pnlTone, price, usd } from '@/lib/format';
import { DREAMDEX_ARENA, FAUCET } from '@/lib/chain';
import { useWallet } from '@/lib/wallet';

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

/** What a visitor who is not playing yet can do about it, as one button. */
function PlayButton({ className = 'btn-primary' }: { className?: string }) {
  const wallet = useWallet();
  const toast = useToast();
  if (wallet.status === 'loading') return <span className="skeleton block h-9 w-40" aria-hidden />;
  if (wallet.status === 'unsupported') {
    return (
      <a href="https://ethereum.org/en/wallets/find-wallet/" target="_blank" rel="noopener noreferrer" className={className}>
        <Wallet className="h-4 w-4" /> Get a browser wallet
      </a>
    );
  }
  if (wallet.status === 'wrong-chain') {
    return (
      <button
        className={className}
        onClick={() => wallet.switchChain().catch(() => toast.push({ type: 'error', title: 'Network not switched', detail: 'Switch to Somnia Tokyo in your wallet.' }))}
      >
        Switch to Somnia Tokyo
      </button>
    );
  }
  return (
    <button
      className={className}
      disabled={wallet.status === 'connecting'}
      onClick={() => wallet.connect().catch(() => toast.push({ type: 'error', title: 'Wallet not connected', detail: 'The request was declined or closed.' }))}
    >
      <Wallet className="h-4 w-4" /> {wallet.status === 'connecting' ? 'Waiting for your wallet…' : 'Connect wallet to play'}
    </button>
  );
}

function LockedHint() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-text-muted">
      <Lock className="h-3.5 w-3.5" /> Connect a wallet to trade and start runs.
    </p>
  );
}

/** For a visitor: the three things a run needs, in order. */
function JoinArena({ arena }: { arena: ArenaView | undefined }) {
  const wallet = useWallet();
  const connected = wallet.status === 'ready';
  const minimum = arena ? usd(arena.minRunCreditStt, 2) : '0.05';
  const steps = [
    {
      title: 'Connect a wallet on Somnia Tokyo',
      body: 'Any browser wallet. You sign your own runs and orders; this app never holds a key.',
      action: connected ? null : <PlayButton className="btn-primary px-4 py-2 text-sm" />,
    },
    {
      title: 'Get test STT',
      body: `STT pays your gas and your run's ${minimum} STT callback credit. The faucet sends 1 STT to a wallet holding less than 1.`,
      action: (
        <a href={FAUCET} target="_blank" rel="noopener noreferrer" className="btn-secondary px-4 py-2 text-sm">
          Faucet <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ),
    },
    {
      title: 'Get paper USDso on dreamDEX',
      body: "Join dreamDEX's Perps Arena for 1,000 paper USDso a week. That is the margin you trade with here.",
      action: (
        <a href={DREAMDEX_ARENA} target="_blank" rel="noopener noreferrer" className="btn-secondary px-4 py-2 text-sm">
          dreamDEX <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ),
    },
  ];
  return (
    <section className="surface p-5" aria-label="Play">
      <h2 className="text-lg font-semibold">Play with your own wallet</h2>
      <p className="mt-1 max-w-[62ch] text-sm text-text-secondary">
        Pick a challenge, trade real dreamDEX perps, and Somnia Reactivity scores you in the block your position changes. You pay for your own callbacks
        from a small STT credit, and whatever is left is yours to withdraw.
      </p>
      <ol className="mt-5 space-y-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border p-4">
            <span className={`num flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-full text-xs font-bold sm:self-center ${i === 0 && connected ? 'bg-success text-white' : 'bg-elevated text-text-secondary'}`}>
              {i + 1}
            </span>
            <div className="min-w-[200px] flex-1">
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="mt-0.5 text-xs text-text-secondary">{step.body}</p>
            </div>
            {step.action}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The player's prepaid callback gas, with what they can do about it. */
function Credit({ actor, player, arena, active }: { actor: Actor; player: PlayerView; arena: ArenaView; active: boolean }) {
  const runAction = useRunAction(actor);
  const toast = useToast();
  const credit = player.creditStt ?? 0;
  const low = active && credit < arena.minRunCreditStt * 0.4;
  const own = actor.mode === 'wallet';
  const run = (input: { action: 'deposit'; amountStt: number } | { action: 'withdraw' }, done: string) =>
    runAction.mutate(input, {
      onSuccess: (r) => toast.push({ type: 'success', title: done, href: r.explorer }),
      onError: (e) => toast.push({ type: 'error', title: input.action === 'deposit' ? 'Credit not added' : 'Credit not withdrawn', detail: e.message }),
    });
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ${low ? 'tint-warning' : 'bg-elevated'}`}>
      <div className="flex items-center gap-2" title="Each Reactivity callback for your run is billed to this credit at the gas it used.">
        <Fuel className={`h-4 w-4 ${low ? 'text-warning' : 'text-text-muted'}`} />
        <div>
          <p className="eyebrow">Callback credit</p>
          <p className={`num text-sm font-semibold ${low ? 'text-warning' : ''}`}>{usd(credit, 4)} STT</p>
        </div>
      </div>
      <p className="min-w-[180px] flex-1 text-xs text-text-muted">
        {low
          ? 'Running low. The run ends itself before your credit could not pay for a callback.'
          : active
            ? 'Each callback costs about 0.0007 to 0.0045 STT.'
            : credit > 0
              ? 'Left over from your runs. Yours to keep for the next run or withdraw.'
              : 'Starting a run deposits the credit its callbacks need.'}
      </p>
      {own && active && (
        <button className="btn-secondary px-3 py-1.5 text-xs" disabled={runAction.isPending} onClick={() => run({ action: 'deposit', amountStt: arena.minRunCreditStt }, 'Credit added')}>
          {runAction.isPending ? 'Adding…' : `Add ${usd(arena.minRunCreditStt, 2)} STT`}
        </button>
      )}
      {own && !active && credit > 0 && (
        <button className="btn-secondary px-3 py-1.5 text-xs" disabled={runAction.isPending} onClick={() => run({ action: 'withdraw' }, 'Credit withdrawn')}>
          {runAction.isPending ? 'Withdrawing…' : 'Withdraw'}
        </button>
      )}
    </div>
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

function RunHero({
  actor,
  arena,
  player,
  account,
  now,
}: {
  actor: Actor;
  arena: ArenaView;
  player: PlayerView | null;
  account: AccountView | undefined;
  now: number;
}) {
  const run = player?.run;
  const runAction = useRunAction(actor);
  const toast = useToast();
  const playing = actor.mode !== 'none';

  if (!player || !run || run.status === 'None') return <StartRun actor={actor} arena={arena} player={player} account={account} heading="Start a run" />;

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
        <StartRun actor={actor} arena={arena} player={player} account={account} heading="Start another run" />
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

      <div className="px-5 pb-5">
        <Credit actor={actor} player={player} arena={arena} active />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-elevated px-5 py-3">
        {playing ? (
          <p className="text-xs text-text-muted">Trade below; the arena scores every change itself.</p>
        ) : (
          <LockedHint />
        )}
        <button
          className="btn-ghost shrink-0 whitespace-nowrap text-xs"
          disabled={!playing || runAction.isPending}
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

function StartRun({
  actor,
  arena,
  player,
  account,
  heading,
}: {
  actor: Actor;
  arena: ArenaView;
  player: PlayerView | null;
  account: AccountView | undefined;
  heading: string;
}) {
  const status = useAgentStatus();
  const markets = status.data?.limits.markets ?? [];
  const [game, setGame] = useState<GameName>('Streak');
  const [symbol, setSymbol] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(SURVIVAL_CHOICES[0].seconds);
  const runAction = useRunAction(actor);
  const toast = useToast();
  const stt = useSttBalance(actor.mode === 'wallet' ? actor.address : null);
  const playing = actor.mode !== 'none';
  const credit = player?.creditStt ?? 0;
  const deposit = Math.max(0, arena.minRunCreditStt - credit);
  // Starting also pays the transaction's own gas, a few thousandths of an STT.
  const short = actor.mode === 'wallet' && stt.data !== undefined && stt.data < deposit + 0.02;

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

      {playing && player && (
        <div className="mt-4">
          <Credit actor={actor} player={player} arena={arena} active={false} />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="space-y-1">
          <p className={`text-xs ${ready ? 'text-success' : 'text-text-muted'}`}>{why}</p>
          {playing && (
            <p className="text-xs text-text-muted">
              {deposit > 0
                ? `Starting deposits ${usd(deposit, 4)} STT of callback credit, billed per callback. What is left stays yours.`
                : 'Your credit covers this run; nothing extra is deposited.'}
            </p>
          )}
          {short && (
            <p className="text-xs font-medium text-warning">
              Your wallet holds {usd(stt.data, 4)} STT, not enough for the credit and gas.{' '}
              <a href={FAUCET} target="_blank" rel="noopener noreferrer" className="underline">
                Get STT
              </a>
            </p>
          )}
        </div>
        {playing ? (
          <button
            className="btn-primary"
            disabled={!chosen || !ready || runAction.isPending || short}
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
            {runAction.isPending ? 'Opening subscriptions…' : deposit > 0 ? `Start ${game} · ${usd(deposit, 2)} STT` : `Start ${game}`}
          </button>
        ) : (
          <PlayButton />
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
function TradeTicket({ actor, runSymbol }: { actor: Actor; runSymbol: string | null }) {
  const status = useAgentStatus();
  const markets = status.data?.limits.markets ?? [];
  const [symbol, setSymbol] = useState<string | null>(null);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [amount, setAmount] = useState('25');
  const chosen = symbol ?? (runSymbol && markets.includes(runSymbol) ? runSymbol : null) ?? markets[0] ?? null;
  const notional = Number(amount);
  const market = useMarket(chosen);
  const preview = usePreview(actor, chosen, side, Number.isFinite(notional) && notional > 0 ? notional : 0);
  const trade = useTrade(actor);
  const toast = useToast();
  const playing = actor.mode !== 'none';

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
        {actor.mode === 'console' ? (
          <span className="badge-muted" title="Orders go through the perps agent's planner and limits.">
            <ShieldCheck className="h-3 w-3" /> agent limits
          </span>
        ) : (
          <span className="badge-muted" title="Market orders (IOC) from your own wallet, sized against your dreamDEX margin.">
            <Wallet className="h-3 w-3" /> your wallet
          </span>
        )}
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
        {!playing && <p className="text-text-muted">Connect a wallet to see the quantity, worst price and liquidation price before you trade.</p>}
        {preview.isFetching && !preview.data && <div className="skeleton h-12 w-full" />}
        {preview.error && <p className="text-danger">{preview.error.message}</p>}
        {preview.data && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <dt className="text-text-muted">Quantity</dt>
            <dd className="num text-right">{preview.data.quantity} {preview.data.market}</dd>
            <dt className="text-text-muted">Worst price (IOC)</dt>
            <dd className="num text-right">{price(preview.data.limitPrice)}</dd>
            <dt className="text-text-muted">Account leverage after</dt>
            <dd className="num text-right">{preview.data.projectedAccountLeverage === null ? '–' : `${preview.data.projectedAccountLeverage}x`}</dd>
            <dt className="text-text-muted">Liquidation price</dt>
            <dd className="num text-right">{preview.data.projectedLiquidationPrice === null ? 'none at this size' : price(preview.data.projectedLiquidationPrice)}</dd>
            {preview.data.refusal && <dd className="col-span-2 mt-1 font-medium text-danger">{preview.data.refusal}</dd>}
          </dl>
        )}
      </div>

      <div className="mt-4">
        {playing ? (
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
            {trade.isPending ? (actor.mode === 'wallet' ? 'Confirm in your wallet…' : 'Sending…') : `${side === 'long' ? 'Long' : 'Short'} ${chosen ?? ''}`}
          </button>
        ) : (
          <PlayButton className="btn-primary w-full" />
        )}
      </div>
    </section>
  );
}

function PositionRow({ actor, p }: { actor: Actor; p: Position }) {
  const trade = useTrade(actor);
  const toast = useToast();
  const playing = actor.mode !== 'none';
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
        <button className="btn-secondary px-3 py-1.5 text-xs" disabled={!playing || trade.isPending} onClick={() => close(50)}>
          Close 50%
        </button>
        <button className="btn-secondary px-3 py-1.5 text-xs" disabled={!playing || trade.isPending} onClick={() => close(100)}>
          Close
        </button>
      </div>
    </li>
  );
}

function Positions({ actor, account, loading, error }: { actor: Actor; account: AccountView | undefined; loading: boolean; error: Error | null }) {
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
      {account && account.positions.length === 0 && account.equityUsdso <= 0 && (
        <p className="mt-3 text-sm text-text-secondary">
          This wallet has no USDso margin on dreamDEX yet.{' '}
          <a href={DREAMDEX_ARENA} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
            Join dreamDEX&apos;s Perps Arena
          </a>{' '}
          for 1,000 paper USDso, then trade here.
        </p>
      )}
      {account && account.positions.length === 0 && account.equityUsdso > 0 && (
        <p className="mt-3 text-sm text-text-muted">Flat everywhere. Open a position from the ticket.</p>
      )}
      {account && account.positions.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--border-subtle)]">
          {account.positions.map((p) => (
            <PositionRow key={p.symbol} actor={actor} p={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

export function ArenaTab() {
  const actor = useActor();
  const session = useSession();
  const wallet = useWallet();
  const arena = useArena(actor.address);
  const account = useAccount(actor);
  const feed = useFeed();
  const now = useNow();
  // Until the wallet and session are known, the visitor's state would be a guess.
  const deciding = wallet.status === 'loading' || !session.data;
  const owner = actor.address ? arena.data?.player?.address : undefined;
  const mine = useMemo(
    () => (feed.data?.events ?? []).filter((e) => owner && e.player.toLowerCase() === owner.toLowerCase()).slice(0, 8),
    [feed.data, owner],
  );

  if (arena.error) {
    return <p className="surface p-5 text-sm text-danger">Could not read the arena: {arena.error.message}</p>;
  }

  if (!deciding && actor.mode === 'none') {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <JoinArena arena={arena.data?.arena} />
        <div className="space-y-5 lg:sticky lg:top-32 lg:self-start">
          <TradeTicket actor={actor} runSymbol={null} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {deciding || arena.isLoading || !arena.data ? (
          <div className="surface h-72 skeleton" />
        ) : (
          <RunHero actor={actor} arena={arena.data.arena} player={arena.data.player} account={account.data} now={now} />
        )}
        <Positions actor={actor} account={account.data} loading={account.isLoading} error={account.error} />
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
        <TradeTicket actor={actor} runSymbol={arena.data?.player?.run.status === 'Active' ? arena.data.player.run.symbol : null} />
      </div>
    </div>
  );
}
