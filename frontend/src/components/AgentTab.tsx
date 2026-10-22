'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { Bot, Send, Terminal, TrendingUp, Users, Flame, Wallet, ShieldCheck } from 'lucide-react';
import { useMarkets, usePlaceBet } from '@/hooks/useDreamDEX';
import { useToast } from '@/components/toast';

/**
 * The Oracle panel.
 *
 * Every answer is a real `dreamarena_*` MCP tool call. This panel POSTs the
 * tool name to /api/oracle, which imports the same arena.ts module the MCP
 * server registers these tools over, so an agent and a player drive identical
 * read code with identical tool names. The tool log records what actually ran,
 * its real latency, and whether it succeeded — nothing here is simulated.
 *
 * A bet intent ("bet 5 tUSDC on Up for BTC") composes the same reads an agent
 * would: list the live markets, then score every candidate with assess_risk
 * and pick the lowest-risk one. The player confirms, and the order is signed
 * by the player's OWN wallet through the same path the Arcade tab uses —
 * a real taker order on the market's book, then a recordEntry on ArcadeEngine.
 * The /api/oracle route stays read-only; execution happens client-side so the
 * server never holds a player's key.
 */

interface ToolLog {
  time: string;
  tool: string;
  ok: boolean;
  detail: string;
  ms: number;
}

interface Message {
  role: 'user' | 'agent';
  text: string;
}

interface OracleResult<T = unknown> {
  ok: boolean;
  tool: string;
  ms: number;
  result?: T;
  error?: string;
}

interface DescribedMarket {
  marketId: string;
  asset: string;
  question: string;
  strike: number | null;
  secondsToExpiry: number;
  seriesIntervalSec: number;
}

/** A bet the player has not yet confirmed. Execution is player-wallet signed. */
interface PendingBet {
  marketId: string;
  asset: string;
  label: string;
  direction: 'up' | 'down';
  stake: number;
  riskScore: number;
  impliedProbability: number | null;
  recommendation: string;
}

const GREETING =
  'I read DreamArena straight off Somnia through the same tool layer as the MCP server. ' +
  'Ask me for live markets, the odds on one, a risk check, your streak, or your balances. ' +
  'Tell me to bet, e.g. "place a 5 tUSDC bet on Up for BTC", and I will line up the market ' +
  'for you to confirm with your wallet.';

async function callOracle<T>(tool: string, args: Record<string, unknown> = {}): Promise<OracleResult<T>> {
  const started = performance.now();
  try {
    const res = await fetch('/api/oracle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool, args }),
    });
    const body = await res.json();
    return { ok: body.ok === true, tool: body.tool ?? tool, ms: Math.round(performance.now() - started), result: body.result, error: body.error };
  } catch (err) {
    return { ok: false, tool, ms: Math.round(performance.now() - started), error: err instanceof Error ? err.message : 'the route did not respond' };
  }
}

const fmtPct = (v: number | null) => (v === null ? 'no quote' : `${(v * 100).toFixed(1)}%`);
const fmtCountdown = (sec: number) =>
  sec <= 0 ? 'now' : sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60 ? ` ${sec % 60}s` : ''}`;

/** Render a describe-shaped market the same way MarketRow would. */
const marketLabel = (m: { asset: string; question: string; strike: number | null }) =>
  m.strike !== null ? `${m.asset} ≥ $${m.strike.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : m.question || m.asset;

export function AgentTab() {
  const { address, isConnected } = useAccount();
  const { markets } = useMarkets();
  const { bet } = usePlaceBet();
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([{ role: 'agent', text: GREETING }]);
  const [logs, setLogs] = useState<ToolLog[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [pending, setPending] = useState<PendingBet | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const log = useCallback((tool: string, ok: boolean, detail: string, ms: number) => {
    setLogs((l) => [
      { time: new Date().toLocaleTimeString([], { hour12: false }), tool, ok, detail, ms },
      ...l,
    ]);
  }, []);

  const say = useCallback((text: string) => setMessages((m) => [...m, { role: 'agent', text }]), []);

  /** Bet intent: scan the live board, score candidates, and hold a pending bet for confirmation. */
  const handleBetIntent = useCallback(
    async (intent: string, q: string) => {
      const amount = intent.match(/(\d+(?:\.\d+)?)\s*t?usdc/i)?.[1];
      if (!amount) {
        say(
          'Tell me the stake too, e.g. "bet 5 tUSDC on Up for BTC" or "bet 5 tUSDC on Down for ETH". ' +
            'The stake is the most you can lose on this market.',
        );
        return;
      }
      const stake = parseFloat(amount);
      const up = q.includes('down') ? false : true;

      const list = await callOracle<{ count: number; markets: DescribedMarket[] }>('dreamarena_list_markets', { limit: 24 });
      log(list.tool, list.ok, list.ok ? `${list.result?.count ?? 0} live` : list.error ?? 'failed', list.ms);
      if (!list.ok) {
        say(`The market feed is unreachable right now (${list.error ?? 'unknown error'}). Try again in a moment.`);
        return;
      }
      const board = list.result?.markets ?? [];
      const named = board.find((m) => q.includes(m.asset.toLowerCase())) ?? board.find((m) => q.includes(m.asset.toLowerCase().slice(0, 3)));
      const asset = named?.asset ?? 'BTC';
      const candidates = board.filter((m) => m.asset === asset).slice(0, 6);

      if (candidates.length === 0) {
        say(`${asset} has no market open for trading this second. Series roll every minute — ask again shortly.`);
        return;
      }

      // Score the candidates through the real risk tool; keep the lowest-risk one.
      let best: DescribedMarket | null = null;
      let bestScore = Infinity;
      let bestRisk: { secondsToExpiry: number; impliedProbability: number | null; recommendation: string } | null = null;
      const wantsScan = q.includes('lowest risk') || q.includes('safest') || q.includes('least risk') || q.includes('risk');
      const scanned = wantsScan ? candidates : [candidates[0]];

      for (const m of scanned) {
        const risk = await callOracle<{
          secondsToExpiry: number;
          riskScore: number;
          impliedProbability: number | null;
          recommendation: string;
        }>('dreamarena_assess_risk', { market: m.marketId, direction: up ? 'up' : 'down' });
        log(risk.tool, risk.ok, risk.ok ? `${m.asset} ${up ? 'up' : 'down'}` : risk.error ?? 'failed', risk.ms);
        if (!risk.ok || !risk.result) continue;
        if (risk.result.riskScore < bestScore) {
          bestScore = risk.result.riskScore;
          best = m;
          bestRisk = risk.result;
        }
      }

      if (!best || !bestRisk) {
        say('None of the candidate markets answered the risk read — the feed may be flaky. Try again in a moment.');
        return;
      }

      setPending({
        marketId: best.marketId,
        asset: best.asset,
        label: marketLabel(best),
        direction: up ? 'up' : 'down',
        stake,
        riskScore: bestScore,
        impliedProbability: bestRisk.impliedProbability,
        recommendation: bestRisk.recommendation,
      });

      const scannedNote =
        scanned.length > 1 ? `Of ${scanned.length} live ${asset} markets, this one had the lowest risk.` : 'This is the soonest live market for the series.';
      say(
        `${marketLabel(best)} · ${up ? 'UP' : 'DOWN'} · score ${bestScore}/10 · ` +
          `implied ${fmtPct(bestRisk.impliedProbability)} · ${fmtCountdown(bestRisk.secondsToExpiry)} left.\n` +
          `${scannedNote} ${bestRisk.recommendation}\n` +
          `Ready to bet ${stake} tUSDC — confirm above and I will sign it with your wallet.`,
      );
    },
    [log, say],
  );

  /** Execute the pending bet through the player's wallet — the same path the Arcade tab uses. */
  const confirmPending = useCallback(async () => {
    if (!pending || placing) return;
    if (!isConnected) {
      say('Connect a wallet first — the order is signed by yours, not a server key.');
      return;
    }
    setPlacing(true);
    const started = performance.now();
    try {
      const now = Math.floor(Date.now() / 1000);
      let market = markets.find(
        (m) => m.marketId.toLowerCase() === pending.marketId.toLowerCase() && m.expiry > now,
      );
      if (!market) {
        // The chosen round rolled while the player reviewed — take the next live one.
        market = markets.find((m) => m.asset === pending.asset && m.expiry > now);
        if (market) {
          say(`The ${pending.asset} round rolled to the next one — confirming on ${marketLabel(market)} instead.`);
        }
      }
      if (!market) {
        say('That market just expired and nothing is open for the series this second — try again in a moment.');
        return;
      }

      const filled = await bet(market, pending.direction === 'up', pending.stake, 0);
      log(
        'dreamarena_place_bet',
        true,
        `${(Number(filled.shares) / 1e6).toFixed(2)} ${pending.direction} shares @ ${filled.price.toFixed(3)} · ${filled.cost.toFixed(2)} tUSDC`,
        Math.round(performance.now() - started),
      );
      toast.push({
        type: 'success',
        title: `${pending.direction.toUpperCase()} filled`,
        detail: `${filled.cost.toFixed(2)} tUSDC → ${(Number(filled.shares) / 1e6).toFixed(2)} shares`,
        href: filled.explorer,
      });
      say(
        `Position open — ${(Number(filled.shares) / 1e6).toFixed(2)} ${pending.direction} shares at ` +
          `${filled.price.toFixed(3)} (${filled.cost.toFixed(2)} tUSDC).\n${filled.explorer}`,
      );
      setPending(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The order did not go through';
      log('dreamarena_place_bet', false, message, Math.round(performance.now() - started));
      toast.push({ type: 'error', title: 'Bet not filled', detail: message });
      say(`That order did not land: ${message}`);
    } finally {
      setPlacing(false);
    }
  }, [pending, placing, isConnected, markets, bet, log, say, toast]);

  const dismissPending = useCallback(() => setPending(null), []);

  const run = useCallback(
    async (intent: string) => {
      setBusy(true);
      setMessages((m) => [...m, { role: 'user', text: intent }]);
      const q = intent.toLowerCase();

      try {
        if (q.includes('bet') || q.includes('play') || q.includes('buy')) {
          await handleBetIntent(intent, q);
          return;
        }

        if (
          q.includes('risk') ||
          q.includes('assess') ||
          q.includes('safe') ||
          q.includes('should i') ||
          q.includes('odds')
        ) {
          const list = await callOracle<{ count: number; markets: DescribedMarket[] }>('dreamarena_list_markets', { limit: 12 });
          log(list.tool, list.ok, list.ok ? `${list.result?.count ?? 0} live` : list.error ?? 'failed', list.ms);
          if (!list.ok) {
            say(`The market feed is unreachable right now (${list.error ?? 'unknown error'}). Try again in a moment.`);
            return;
          }
          const markets = (list.result?.markets ?? []).slice(0, 6);
          const named = markets.find((m) => q.includes(m.asset.toLowerCase()));
          const shift = q.includes('down') ? 'down' : 'up';

          if (q.includes('risk') || q.includes('assess') || q.includes('safe') || q.includes('should i')) {
            const target = named ?? markets[0];
            if (!target) {
              say('Nothing is open for trading this second. Ask me to list markets and pick one by asset.');
              return;
            }
            const risk = await callOracle<{
              direction: 'up' | 'down';
              riskScore: number;
              secondsToExpiry: number;
              spreadBps: number | null;
              impliedProbability: number | null;
              recommendation: string;
            }>('dreamarena_assess_risk', {
              market: target.asset,
              direction: shift,
            });
            log(risk.tool, risk.ok, risk.ok ? `${target.asset} ${shift}` : risk.error ?? 'failed', risk.ms);
            if (!risk.ok) {
              say(`That read failed against the chain (${risk.error ?? 'unknown error'}).`);
              return;
            }
            const r = risk.result!;
            say(
              `Risk on ${marketLabel(target)} (${shift}):\n` +
                `  Score ${r.riskScore}/10 · resolves in ${fmtCountdown(r.secondsToExpiry)} · spread ${r.spreadBps ?? 'n/a'} bps\n` +
                `  Implied ${fmtPct(r.impliedProbability)} → ${r.recommendation}`,
            );
            return;
          }

          // odds path — resolves through the market list so the pick is real
          const target = named ?? markets[0];
          if (!target) {
            say('Nothing is open for trading this second. Ask me to list markets and pick one by asset.');
            return;
          }
          const odds = await callOracle<{
            market: DescribedMarket;
            up: { side: 'UP'; price: number | null; payoutMultiple: number | null };
            down: { side: 'DOWN'; price: number | null; payoutMultiple: number | null };
          }>('dreamarena_get_odds', { market: target.asset });
          log(odds.tool, odds.ok, odds.ok ? `${target.asset} book read` : odds.error ?? 'failed', odds.ms);
          if (!odds.ok) {
            say(`That read failed against the chain (${odds.error ?? 'unknown error'}).`);
            return;
          }
          const o = odds.result!;
          const fmt = (v: { price: number | null; payoutMultiple: number | null }) =>
            `${fmtPct(v.price)}${v.payoutMultiple ? ` → pays ${v.payoutMultiple.toFixed(2)}x` : ''}`;
          say(
            `${marketLabel(o.market)} — resolves in ${fmtCountdown(o.market.secondsToExpiry)}\n` +
              `  UP   ask ${fmt(o.up)}\n` +
              `  DOWN ask ${fmt(o.down)}`,
          );
          return;
        }

        if (q.includes('market') || q.includes('list') || q.includes('find')) {
          const list = await callOracle<{ count: number; markets: DescribedMarket[]; note?: string }>('dreamarena_list_markets', { limit: 12 });
          log(list.tool, list.ok, list.ok ? `${list.result?.count ?? 0} live` : list.error ?? 'failed', list.ms);
          if (!list.ok) {
            say(`The market feed is unreachable right now (${list.error ?? 'unknown error'}). Try again in a moment.`);
            return;
          }
          const markets = list.result?.markets ?? [];
          if (markets.length === 0) {
            say(list.result?.note ?? 'Nothing is open for trading this second. Series roll every minute — ask again shortly.');
            return;
          }
          say(
            `${markets.length} market${markets.length === 1 ? '' : 's'} open right now:\n` +
              markets
                .slice(0, 6)
                .map((m) => {
                  const label = m.strike !== null ? m.question || `${m.asset} ≥ $${m.strike}` : m.question || m.asset;
                  return `  • ${label} — ${fmtCountdown(Math.max(0, m.secondsToExpiry))} left`;
                })
                .join('\n'),
          );
          return;
        }

        if (q.includes('streak') || q.includes('stat') || q.includes('score')) {
          if (!address) {
            say('Connect a wallet and I will read your streak from ArcadeEngine.');
            return;
          }
          const streak = await callOracle<{
            currentStreak: number;
            longestStreak: number;
            multiplier: number;
            wins: number;
            losses: number;
            winRate: number;
            nextMilestone: number | null;
            totalShares: number;
          }>('dreamarena_get_streak', { address });
          log(streak.tool, streak.ok, streak.ok ? shortAddr(address) : streak.error ?? 'failed', streak.ms);
          if (!streak.ok) {
            say(`That read failed against the chain (${streak.error ?? 'unknown error'}).`);
            return;
          }
          const s = streak.result!;
          say(
            `Streak ${s.currentStreak} (${s.multiplier.toFixed(2)}x) · ${s.wins}W/${s.losses}L · ${s.winRate}% win rate.` +
              (s.nextMilestone ? ` Next milestone at ${s.nextMilestone}.` : ''),
          );
          return;
        }

        if (q.includes('balance') || q.includes('tusdc') || q.includes('stt')) {
          if (!address) {
            say('Connect a wallet to read your balances.');
            return;
          }
          const bal = await callOracle<{ address: string; tusdc: number; stt: number }>('dreamarena_get_balances', { address });
          log(bal.tool, bal.ok, bal.ok ? 'tUSDC + STT' : bal.error ?? 'failed', bal.ms);
          if (!bal.ok) {
            say(`That read failed against the chain (${bal.error ?? 'unknown error'}).`);
            return;
          }
          say(
            `${bal.result!.tusdc.toFixed(2)} tUSDC to bet with · ${bal.result!.stt.toFixed(3)} STT for gas.`,
          );
          return;
        }

        if (q.includes('arena') || q.includes('dao') || q.includes('community')) {
          const arenas = await callOracle<{
            count: number;
            arenas: { daoId: number; name: string; symbol: string; creator: string; treasury: string; builderFeeBpsTimes1k: number; createdAt: number }[];
            note?: string;
          }>('dreamarena_list_arenas');
          log(arenas.tool, arenas.ok, arenas.ok ? `${arenas.result?.count ?? 0} deployed` : arenas.error ?? 'failed', arenas.ms);
          if (!arenas.ok) {
            say(`That read failed against the chain (${arenas.error ?? 'unknown error'}).`);
            return;
          }
          const a = arenas.result!;
          if (a.count === 0) {
            say(a.note ?? 'No arenas deployed yet.');
            return;
          }
          say(
            `${a.count} arena${a.count === 1 ? '' : 's'} deployed:\n` +
              a.arenas
                .map((x) => `  • ${x.name} (${x.symbol}) — fee ${(x.builderFeeBpsTimes1k / 1000).toFixed(2)}%`)
                .join('\n') +
              `\nEach one is a builder code earning a real fee on the orders routed through it.`,
          );
          return;
        }

        log('agent_route', false, 'no intent matched', 0);
        say('Try: "list markets", "odds on BTC", "risk on ETH", "my streak", "my balances", or "arenas".');
      } catch (err) {
        log('agent_route', false, err instanceof Error ? err.message : 'read failed', 0);
        say('That read failed against the chain. Try again in a moment.');
      } finally {
        setBusy(false);
      }
    },
    [address, log, say, handleBetIntent],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const text = input.trim();
    setInput('');
    run(text);
  };

  const quick = [
    { label: 'Live markets', icon: TrendingUp, action: 'List live markets' },
    { label: 'Odds on BTC', icon: Bot, action: 'Odds on BTC' },
    { label: 'Risk on BTC', icon: ShieldCheck, action: 'Assess risk on BTC' },
    { label: 'My streak', icon: Flame, action: 'My streak' },
    { label: 'My balances', icon: Wallet, action: 'My balances' },
    { label: 'Arenas', icon: Users, action: 'List arenas' },
    { label: 'Bet 5 tUSDC on BTC up', icon: TrendingUp, action: 'Find the lowest risk BTC market and bet 5 tUSDC on Up' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <section className="surface flex flex-col overflow-hidden" style={{ height: 'min(70vh, 560px)' }}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h3 className="font-bold">AI Oracle</h3>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success pulse-fast" /> Reading chain
          </span>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-primary/10 text-text-primary border border-primary/20'
                    : 'bg-elevated border border-border text-text-primary'
                }`}
              >
                {msg.text}
              </div>
            </motion.div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-elevated border border-border rounded-2xl px-4 py-3 text-sm text-text-muted">
                <span className="animate-pulse">Reading chain…</span>
              </div>
            </div>
          )}
        </div>

        {pending && (
          <div className="px-6 pt-3">
            <div className="border border-primary/30 bg-primary/5 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Bet pending — your wallet signs
                </p>
                <button
                  onClick={dismissPending}
                  disabled={placing}
                  className="text-text-muted hover:text-text-primary transition-colors text-sm"
                  aria-label="Cancel pending bet"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-text-primary font-medium">
                {pending.label}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-text-secondary">
                <span>
                  {pending.direction.toUpperCase()} · <strong>{pending.stake.toFixed(2)} tUSDC</strong>
                </span>
                <span>risk {pending.riskScore}/10</span>
                {pending.impliedProbability !== null && (
                  <span>implied {fmtPct(pending.impliedProbability)}</span>
                )}
              </div>
              <p className="text-xs text-text-muted mt-2">{pending.recommendation}</p>
              {!isConnected && (
                <p className="text-xs text-warning mt-2">
                  Connect a wallet in the top bar first — this order is signed by your address.
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={confirmPending}
                  disabled={placing || !isConnected || busy}
                  className="flex-1 btn-primary py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {placing ? 'Filling on the book…' : `Place bet · ${pending.stake.toFixed(2)} tUSDC`}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 pt-3 flex flex-wrap gap-2">
          {quick.map((qa) => (
            <button
              key={qa.label}
              onClick={() => run(qa.action)}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-elevated border border-border text-text-secondary hover:border-primary/40 transition-colors disabled:opacity-50"
            >
              <qa.icon className="w-3.5 h-3.5" /> {qa.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="p-4 border-t border-border flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Markets, odds, risk, or "bet 5 tUSDC on Up for BTC"…'
            className="flex-1 bg-elevated border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
          />
          <button type="submit" disabled={busy || !input.trim()} className="btn-primary p-3 rounded-xl disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </section>

      <section className="surface flex flex-col overflow-hidden" style={{ height: 'min(70vh, 560px)' }}>
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <Terminal className="w-4 h-4 text-text-muted" />
          <h3 className="text-sm font-bold">Tool log</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 font-mono text-xs space-y-2">
          {logs.length === 0 ? (
            <p className="text-text-muted">
              No calls yet. Every entry here is real — reads answered by the chain, bets signed by your wallet.
            </p>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={entry.ok ? 'text-success' : 'text-danger'}>●</span>
                  <span className="text-text-muted">{entry.time}</span>
                  <span className="text-text-primary truncate">{entry.tool}</span>
                  <span className="text-text-muted ml-auto">{entry.ms}ms</span>
                </div>
                <div className="text-text-muted pl-5 truncate">→ {entry.detail}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}