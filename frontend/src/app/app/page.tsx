'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TrendingUp, TrendingDown, Flame, X, Radio, Clock, Swords, Heart } from 'lucide-react';
import { useMarkets, useCountdown, useOdds, usePlaceBet } from '@/hooks/useDreamDEX';
import { useActiveArena, useArenaApproval } from '@/hooks/useArena';
import { usePlayerStats, useLeaderboard, useDAOCount } from '@/hooks/useContracts';
import { LogoText } from '@/components/Logo';
import { TopHUD } from '@/components/TopHUD';
import { Avatar } from '@/components/Avatar';
import { ControlDeck } from '@/components/ControlDeck';
import { AgentTab } from '@/components/AgentTab';
import { ProfileTab } from '@/components/ProfileTab';
import { DAOTab } from '@/components/DAOTab';
import { useToast } from '@/components/toast';
import { SettlementFeed } from '@/components/SettlementFeed';
import { ReactivityProof } from '@/components/ReactivityProof';
import { SettlementCelebration } from '@/components/SettlementCelebration';
import { ReactiveToasts } from '@/components/ReactiveToasts';
import { MilestoneCelebration } from '@/components/MilestoneCelebration';
import { MarketRow, formatCountdown, marketLabel } from '@/components/MarketRow';
import { DeployBanner } from '@/components/DeployBanner';
import type { ArenaMarket } from '@/lib/dreamdex';

const TABS = ['play', 'dao', 'agent', 'leaderboard', 'profile'] as const;
type Tab = (typeof TABS)[number];

const TITLES: Record<Tab, { title: string; sub: string }> = {
  play: { title: 'Arcade', sub: 'Live DreamDEX markets, settled the moment the oracle answers' },
  dao: { title: 'Community Arenas', sub: 'Deploy a branded arena and earn builder fees on its flow' },
  agent: { title: 'AI Oracle', sub: 'Query on-chain state in plain language' },
  leaderboard: { title: 'Leaderboard', sub: 'Ranked by current win streak' },
  profile: { title: 'Profile', sub: 'Your on-chain player card' },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-background" />}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const params = useSearchParams();
  const requested = params.get('tab') as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    requested && TABS.includes(requested) ? requested : 'play',
  );
  const [game, setGame] = useState<{ id: string; market: ArenaMarket | null } | null>(null);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <TopHUD />

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 lg:p-8 max-w-[1200px] w-full mx-auto pb-8">
          <div className="flex items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-2xl font-bold">{TITLES[activeTab].title}</h1>
              <p className="text-sm text-text-muted mt-1">{TITLES[activeTab].sub}</p>
            </div>
            <Link
              href="/"
              className="hidden md:flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              <LogoText />
            </Link>
          </div>

          <DeployBanner />

          {activeTab === 'play' && <PlayTab onPlay={(id, market) => setGame({ id, market })} />}
          {activeTab === 'dao' && <DAOTab />}
          {activeTab === 'agent' && <AgentTab />}
          {activeTab === 'leaderboard' && <LeaderboardTab />}
          {activeTab === 'profile' && <ProfileTab />}
        </div>
      </main>

      <ControlDeck activeTab={activeTab} onSelect={(t) => setActiveTab(t as Tab)} />

      <AnimatePresence>
        {game && (
          <BetModal gameId={game.id} initialMarket={game.market} onClose={() => setGame(null)} />
        )}
      </AnimatePresence>

      <SettlementCelebration />
      <MilestoneCelebration />
      <ReactiveToasts />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

const GAMES = [
  {
    id: 'higher-lower',
    title: 'Higher or Lower',
    desc: 'One market, one call. Settles the moment it expires.',
    icon: TrendingUp,
    gameType: 0,
  },
  {
    id: 'streak-survivor',
    title: 'Streak Survivor',
    desc: 'Chain wins across back-to-back markets. One miss resets you.',
    icon: Flame,
    gameType: 1,
  },
  {
    id: 'boss-battle',
    title: 'Boss Battle',
    desc: 'Three straight calls to slay the boss. Miss one and the run is over.',
    icon: Swords,
    gameType: 2,
  },
];

function PlayTab({ onPlay }: { onPlay: (id: string, market: ArenaMarket | null) => void }) {
  const { markets, loading, error } = useMarkets();
  const [asset, setAsset] = useState<string>('All');

  const assets = useMemo(
    () => ['All', ...Array.from(new Set(markets.map((m) => m.asset))).sort()],
    [markets],
  );
  const visible = asset === 'All' ? markets : markets.filter((m) => m.asset === asset);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {GAMES.map((game, i) => (
          <motion.button
            key={game.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onPlay(game.id, null)}
            className="surface p-6 text-left hover:border-border-default transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
              <game.icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">{game.title}</h3>
            <p className="text-sm text-text-secondary">{game.desc}</p>
          </motion.button>
        ))}
      </div>

      <div className="surface p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" />
            <h3 className="font-bold">Live markets</h3>
          </div>
          <span className="text-xs font-medium text-text-muted">
            {loading ? 'Reading the book…' : `${visible.length} open now`}
          </span>
        </div>

        {assets.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {assets.map((a) => (
              <button
                key={a}
                onClick={() => setAsset(a)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  asset === a
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'bg-elevated text-text-muted border-border hover:text-text-secondary'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        )}

        {error ? (
          <div className="text-center py-8 text-sm text-danger">{error}</div>
        ) : loading ? (
          <div className="text-center py-8 text-text-muted">Loading live markets…</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">
            No market is open for trading this second. Series roll every minute — this will
            refill on its own.
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((market) => (
              <MarketRow
                key={market.marketId}
                market={market}
                onClick={() => onPlay('higher-lower', market)}
              />
            ))}
          </div>
        )}
      </div>

      <SettlementFeed />
      <ReactivityProof />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const BOARDS = [
  { id: 'streak', label: 'Streaks', sort: (a: any, b: any) => b.streak - a.streak || b.wins - a.wins },
  { id: 'wins', label: 'Wins', sort: (a: any, b: any) => b.wins - a.wins || b.winRate - a.winRate },
  { id: 'accuracy', label: 'Win rate', sort: (a: any, b: any) => b.winRate - a.winRate || b.played - a.played },
  { id: 'bosses', label: 'Bosses', sort: (a: any, b: any) => b.bossesSlain - a.bossesSlain || b.streak - a.streak },
] as const;

function LeaderboardTab() {
  const { rows: allRows, isLoading } = useLeaderboard();
  const [board, setBoard] = useState<(typeof BOARDS)[number]['id']>('streak');

  const active = BOARDS.find((b) => b.id === board) ?? BOARDS[0];
  // The same on-chain reads, ranked differently — no separate query per tab.
  const rows = useMemo(() => [...allRows].sort(active.sort), [allRows, active]);

  return (
    <div className="surface overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="font-bold">On-chain standings</h3>
          <span className="text-xs font-medium text-text-muted">
            {isLoading ? 'Reading…' : `${rows.length} player${rows.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {BOARDS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBoard(b.id)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                board === b.id
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'bg-elevated text-text-muted border-border hover:text-text-secondary'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-text-muted">Reading the settlement stream…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 px-6 text-text-muted text-sm">
          Nobody has settled a game recently. Place a bet and you will be rank #1.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-6 text-xs font-medium uppercase text-text-muted">#</th>
                  <th className="text-left py-4 px-6 text-xs font-medium uppercase text-text-muted">Player</th>
                  <th className="text-right py-4 px-6 text-xs font-medium uppercase text-text-muted">Streak</th>
                  <th className="text-right py-4 px-6 text-xs font-medium uppercase text-text-muted">W/L</th>
                  <th className="text-right py-4 px-6 text-xs font-medium uppercase text-text-muted">Win rate</th>
                  <th className="text-right py-4 px-6 text-xs font-medium uppercase text-text-muted">Bosses</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.player} className="border-b border-border hover:bg-elevated transition-colors">
                    <td className="py-4 px-6 font-bold">{i + 1}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <Avatar address={row.player} size={28} />
                        <span className="font-mono text-sm">{shortAddr(row.player)}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="inline-flex items-center gap-1 font-bold">
                        {row.streak > 0 && <Flame className="w-3.5 h-3.5 text-warning" />}
                        {row.streak}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right text-sm tabular-nums text-text-secondary">
                      {row.wins}/{row.losses}
                    </td>
                    <td className="py-4 px-6 text-right text-sm tabular-nums">{row.winRate}%</td>
                    <td className="py-4 px-6 text-right text-sm tabular-nums">
                      {row.bossesSlain > 0 ? `⚔️ ${row.bossesSlain}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-6 py-3 text-xs text-text-muted border-t border-border">
            Stats are read per-player from ArcadeEngine and are exact. The roster covers players
            who have settled within the log window this RPC serves.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bet modal
// ---------------------------------------------------------------------------

function BetModal({
  gameId,
  initialMarket,
  onClose,
}: {
  gameId: string;
  initialMarket: ArenaMarket | null;
  onClose: () => void;
}) {
  const { markets } = useMarkets();
  const [market, setMarket] = useState<ArenaMarket | null>(initialMarket);
  const [up, setUp] = useState<boolean | null>(null);
  const [stake, setStake] = useState('10');
  const { bet, stage, result, error, warning, isPlacing, reset } = usePlaceBet();
  const { odds } = useOdds(market, up);
  const secondsLeft = useCountdown(market?.expiry);
  const { push } = useToast();
  const arena = useActiveArena();
  const approval = useArenaApproval(market);

  const game = GAMES.find((g) => g.id === gameId) ?? GAMES[0];
  const stakeNum = parseFloat(stake || '0');
  const isSurvivor = game.id === 'streak-survivor';
  const isBoss = game.id === 'boss-battle';
  // The boss's health is on-chain: three rounds, one heart lost per round won.
  const { bossRound, bossesSlain, refetch: refetchStats } = usePlayerStats();
  // Streak Survivor is a run: each settled bet rolls into the next market in
  // the same series, so the round counter is the thing being defended.
  const [round, setRound] = useState(1);

  // These markets die every minute. If the one in the modal expires, move the
  // player to the next in the same series rather than letting them sign a
  // transaction that can only revert.
  useEffect(() => {
    if (!market || secondsLeft > 0 || isPlacing) return;
    const next = markets.find((m) => m.asset === market.asset && m.expiry > market.expiry);
    setMarket(next ?? null);
    if (next) push({ type: 'info', title: 'Market rolled', detail: `Moved you to the next ${next.asset} market` });
  }, [secondsLeft, market, markets, isPlacing, push]);

  const handleBet = async () => {
    if (up === null || !market || stakeNum <= 0) return;
    try {
      const filled = await bet(market, up, stakeNum, game.gameType, {
        // The arena stays on the order as its builder; the fee is whatever
        // this pool's cap allows, which on Shannon is 0. Sending the arena's
        // nominal fee instead reverts BuilderFeeExceedsCap before anything else.
        builder: arena.builder,
        builderFeeBpsTimes1k: approval.effectiveFee ?? 0n,
      });
      push({
        type: 'success',
        title: `${up ? 'UP' : 'DOWN'} position open`,
        detail: `${(Number(filled.shares) / 1e6).toFixed(2)} shares at ${filled.price.toFixed(3)}`,
        href: filled.explorer,
      });
    } catch {
      // surfaced inline below
    }
  };

  // Streak Survivor: once a position is open, offer the next market in the
  // series so a run is a run rather than a sequence of separate visits here.
  const advance = () => {
    if (!market) return;
    const next = markets.find((m) => m.asset === market.asset && m.expiry > market.expiry);
    if (!next) {
      push({ type: 'info', title: 'No next market yet', detail: `Waiting for the next ${market.asset} round` });
      return;
    }
    reset();
    setMarket(next);
    setUp(null);
    setRound((r) => r + 1);
    refetchStats(); // the boss's health lives on-chain, not in this component
  };

  const payout = odds?.ask ? stakeNum / odds.ask : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="surface w-full max-w-lg p-8 max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h3 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
              {game.title}
              {isSurvivor && <span className="text-text-muted font-medium text-base">· round {round}</span>}
              {isBoss && (
                <span className="flex items-center gap-1" title={`${3 - bossRound} rounds left`}>
                  {[0, 1, 2].map((h) => (
                    <Heart
                      key={h}
                      className={`w-4 h-4 ${
                        h < 3 - bossRound ? 'text-danger fill-danger' : 'text-border'
                      }`}
                    />
                  ))}
                </span>
              )}
            </h3>
            {market && <p className="text-sm text-text-muted mt-1">{marketLabel(market)}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded-lg bg-elevated flex items-center justify-center text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!market ? (
          <div className="mb-6">
            <label className="block text-sm font-medium text-text-muted mb-3">Pick a live market</label>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {markets.length === 0 ? (
                <p className="text-sm text-text-muted bg-elevated rounded-xl px-4 py-3">
                  No market is open this second. Series roll every minute — hold on.
                </p>
              ) : (
                markets.map((m) => (
                  <MarketRow key={m.marketId} market={m} onClick={() => setMarket(m)} compact />
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-6 text-sm">
              <Clock className="w-4 h-4 text-text-muted" />
              <span className={secondsLeft <= 10 ? 'text-warning font-bold' : 'text-text-secondary'}>
                Resolves in {formatCountdown(secondsLeft)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <SideButton side="up" active={up === true} onClick={() => setUp(true)} />
              <SideButton side="down" active={up === false} onClick={() => setUp(false)} />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-text-muted mb-3">Stake (tUSDC)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="w-full bg-elevated border border-border rounded-xl px-5 py-4 text-2xl font-bold focus:outline-none focus:border-primary transition-colors"
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-text-muted font-medium">
                  tUSDC
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                {['1', '5', '10', '25'].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setStake(amount)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                      stake === amount
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-elevated text-text-muted border border-border'
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-elevated p-4 mb-4 space-y-2 text-sm">
              <Row
                label="Market odds"
                value={odds?.ask ? `${(odds.ask * 100).toFixed(1)}%` : up === null ? 'Pick a side' : 'No quote'}
              />
              <Row
                label="Pays if right"
                value={payout ? `${payout.toFixed(2)} tUSDC` : '—'}
                strong
              />
              <p className="text-xs text-text-muted pt-1">
                The payout is the market&apos;s, not a house edge: each winning share redeems for
                exactly 1 tUSDC.
              </p>
            </div>

            {error && (
              <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-4">
                {error}
              </div>
            )}
            {warning && (
              <div className="text-sm text-warning bg-warning/10 border border-warning/20 rounded-xl px-4 py-3 mb-4">
                {warning}
              </div>
            )}
            {result && (
              <div className="text-sm text-success bg-success/10 border border-success/20 rounded-xl px-4 py-3 mb-4">
                Filled {(Number(result.shares) / 1e6).toFixed(2)} shares at{' '}
                {result.price.toFixed(3)} ·{' '}
                <a href={result.explorer} target="_blank" rel="noopener noreferrer" className="underline">
                  explorer
                </a>
              </div>
            )}

            {isBoss && (
              <div className="text-xs bg-elevated rounded-xl px-4 py-3 mb-4 text-text-secondary">
                {bossRound === 0
                  ? 'Round 1 of 3. Three straight wins slays the boss; one miss ends the run.'
                  : `Round ${bossRound + 1} of 3 — ${3 - bossRound} more to go. A loss here resets you to zero.`}
                {bossesSlain > 0 && (
                  <span className="text-warning"> · {bossesSlain} slain so far</span>
                )}
              </div>
            )}

            {arena.dao && (
              <div className="text-xs text-text-muted bg-elevated rounded-xl px-4 py-3 mb-4">
                Playing in <span className="text-text-primary font-medium">{arena.dao.name}</span> ·
                {' '}{Number(approval.effectiveFee ?? arena.builderFeeBpsTimes1k ?? 0n) / 1000} bps builder fee to its treasury
                {approval.capped && (
                  <span className="block mt-1 text-warning">
                    This pool caps builder fees at {Number(approval.cap ?? 0n) / 1000} bps, below the
                    arena&apos;s {Number(arena.builderFeeBpsTimes1k ?? 0n) / 1000} bps. The order is still
                    routed through the arena; it just cannot charge more than the pool allows.
                  </span>
                )}
              </div>
            )}

            {approval.error && (
              <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-4 break-words">
                {approval.error}
              </div>
            )}

            {approval.needed && approval.approved === false ? (
              <button
                onClick={approval.approve}
                disabled={approval.approving}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {approval.approving ? 'Approving…' : 'Approve arena fee (once per market pool)'}
              </button>
            ) : result && (isSurvivor || isBoss) ? (
              <button onClick={advance} className="w-full btn-primary">
                {isBoss ? `Round ${Math.min(3, bossRound + 2)} of 3 →` : 'Next round →'}
              </button>
            ) : (
              <button
                onClick={handleBet}
                disabled={up === null || isPlacing || stakeNum <= 0 || secondsLeft <= 0}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {stage === 'trading'
                  ? 'Filling on the book…'
                  : stage === 'recording'
                    ? 'Recording your entry…'
                    : result
                      ? 'Position open'
                      : 'Place bet'}
              </button>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={strong ? 'font-bold text-text-primary' : 'text-text-secondary'}>{value}</span>
    </div>
  );
}

function SideButton({
  side,
  active,
  onClick,
}: {
  side: 'up' | 'down';
  active: boolean;
  onClick: () => void;
}) {
  const isUp = side === 'up';
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`py-6 rounded-xl border-2 transition-colors ${
        active
          ? isUp
            ? 'border-success bg-success/10'
            : 'border-danger bg-danger/10'
          : 'border-border bg-elevated hover:border-border-default'
      }`}
    >
      <Icon
        className={`w-8 h-8 mx-auto mb-2 ${
          active ? (isUp ? 'text-success' : 'text-danger') : 'text-text-muted'
        }`}
      />
      <span className={`font-bold ${active ? (isUp ? 'text-success' : 'text-danger') : 'text-text-primary'}`}>
        {isUp ? 'UP' : 'DOWN'}
      </span>
    </motion.button>
  );
}
