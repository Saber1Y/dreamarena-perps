"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Shield,
  TrendingUp,
  TrendingDown,
  Github,
  ExternalLink,
  CheckCircle2,
  Flame,
  Repeat,
  Users,
  BadgeCheck,
  Zap,
  Gamepad2,
  Bot,
  Trophy,
  User,
  Clock,
} from "lucide-react";
import { LogoText } from "@/components/Logo";
import { marketLabel, formatCountdown } from "@/components/MarketRow";
import ArchitectureCanvas from "@/components/ArchitectureCanvas";
import { useMarkets, useCountdown } from "@/hooks/useDreamDEX";
import { CONTRACTS } from "@/lib/web3";
import { useLeaderboard } from "@/hooks/useContracts";

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-background text-text-primary overflow-x-hidden">
      <LandingNav />
      <Hero />
      <ArenaModules />
      <Architecture />
      <Capabilities />
      <HowItWorks />
      <LeaderboardPreview />
      <StatsStrip />
      <ProofSection />
      <Transparency />
      <Footer />
    </main>
  );
}

/* 1. Nav */
function LandingNav() {
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50">
      <motion.nav
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center rounded-full border border-border bg-white/90 backdrop-blur-xl pl-4 sm:pl-5 pr-2 sm:pr-3 py-2.5 shadow-[0_8px_30px_rgba(31,27,22,0.08)] w-[min(920px,calc(100vw-1rem))]">
          {/* Left: logo */}
          <a href="#" className="flex items-center shrink-0">
            <LogoText />
          </a>

          {/* Center: links - flex-1 centers them between logo and actions */}
          <div className="hidden md:flex items-center justify-center flex-1 mx-1 min-w-0">
            <NavLink href="#how-it-works" label="How it works" />
            <NavLink href="#architecture" label="Architecture" />
            <NavLink href="#proof" label="Proof" />
            <NavLink href="/app?tab=leaderboard" label="Leaderboard" />
          </div>

          {/* Right: actions */}
          <button className="hidden lg:inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary transition-colors px-3 py-1.5 rounded-full shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-success pulse-fast" />
            Testnet
          </button>
          <Link
            href="/app"
            className="btn-primary !rounded-full !px-4 !py-2 whitespace-nowrap shrink-0"
          >
            Launch App
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </motion.nav>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-2.5 sm:px-3 py-1.5 rounded-full text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-elevated transition-all whitespace-nowrap"
    >
      {label}
    </Link>
  );
}

/* 2. Hero - the live bet card is the hero, not an accessory */
function Hero() {
  return (
    <section className="relative min-h-[100dvh] flex items-center overflow-hidden pt-24 pb-16">
      {/* Subtle ambient wash - sharp cream, barely-there purple hint */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-48 -right-40 w-[32rem] h-[32rem] rounded-full bg-primary/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-[1200px] mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,440px)] gap-12 lg:gap-20 items-center">
          {/* Copy column - tighter, punchier for a game */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-5xl sm:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.04] mb-6">
              The prediction
              <br />
              arcade.
              <br />
              Five arenas. One chain.
            </h1>

            <p className="text-lg text-text-secondary leading-relaxed mb-8 max-w-md">
              Play markets, run a community DAO, ask the Oracle, race the
              leaderboard, and own your player card. Every move is a DreamDEX
              Event Contract that settles in the same block via Somnia
              Reactivity.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Link href="/app" className="btn-primary text-base !px-6 !py-3.5">
                Enter the arena
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/app?tab=leaderboard"
                className="btn-ghost text-base !px-6 !py-3.5"
              >
                See the streak leaders
              </Link>
            </div>
          </motion.div>

          {/* LIVE BET card - the hero */}
          <LiveBetCard />
        </div>
      </div>
    </section>
  );
}

/* A real on-chain live bet - shows genuine market + price data from the deployed contracts */
function LiveBetCard() {
  const { markets, loading } = useMarkets();
  const market = markets[0];
  const secondsLeft = useCountdown(market?.expiry);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="surface p-6 sm:p-7 relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-danger pulse-fast" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
              Live
            </span>
          </div>
          {market && (
            <span className="font-mono text-[11px] text-text-muted">
              {market.marketId.slice(-6)}
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-center py-16 text-text-muted">
            Reading on-chain markets...
          </div>
        ) : market ? (
          <>
            <div className="flex items-end justify-between mb-6 gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-muted mb-1">
                  {market.asset}
                </div>
                <div className="text-2xl sm:text-3xl font-bold leading-tight">
                  {marketLabel(market)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-primary bg-primary/10 tabular-nums">
                  <Clock className="w-4 h-4" />
                  {formatCountdown(secondsLeft)}
                </span>
                <span className="font-mono text-[11px] text-text-muted">
                  {market.intervalSec}s series
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <Link
                href="/app"
                className="py-4 rounded-xl border-2 border-primary/40 bg-primary/10 text-primary font-bold text-lg text-center transition-transform hover:scale-[1.02] active:scale-95"
              >
                UP
              </Link>
              <Link
                href="/app"
                className="py-4 rounded-xl border-2 border-danger/40 bg-danger/10 text-danger font-bold text-lg text-center transition-transform hover:scale-[1.02] active:scale-95"
              >
                DOWN
              </Link>
            </div>

            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Shield className="w-4 h-4" />
              Live market on Somnia Shannon - bet resolves via the reactivity
              precompile at 0x0100.
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <div className="text-3xl mb-3 text-text-muted">◌</div>
            <h3 className="font-bold mb-2">Between rounds</h3>
            <p className="text-sm text-text-muted mb-6">
              No market is open for trading this second. The series roll every
              minute — the next one opens shortly.
            </p>
            <Link
              href="/app"
              className="btn-primary inline-flex items-center gap-2"
            >
              Open the arena <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* 2.5. Arena modules - the five rooms, honest and real */
function ArenaModules() {
  const modules = [
    {
      icon: Gamepad2,
      title: "Arcade",
      desc: "Higher or Lower, Streak Survivor, and Boss Battle. Pick a real market, call Up or Down, and let it settle in the same block.",
      tag: "3 game modes",
    },
    {
      icon: Users,
      title: "Community DAO",
      desc: "Deploy a branded arena with its own treasury and builder fee. Every bet routed through it pays that treasury, on-chain.",
      tag: "builder fees",
    },
    {
      icon: Bot,
      title: "AI Oracle",
      desc: "Ask for live markets, odds, risk, or your streak in plain language. An MCP server exposes the same tools to any AI agent.",
      tag: "MCP server",
    },
    {
      icon: Trophy,
      title: "Leaderboard",
      desc: "Streaks, wins, accuracy and bosses slain, each read per-player from ArcadeEngine. No fabricated rows.",
      tag: "live standings",
    },
    {
      icon: User,
      title: "Profile",
      desc: "Your player card: tUSDC, win rate, achievements - all unlocked from real contract state, not mock numbers.",
      tag: "on-chain stats",
    },
  ];

  return (
    <section className="py-32 px-6 lg:px-12 border-t border-border">
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Five arenas, one player
          </h2>
          <p className="text-lg text-text-secondary max-w-md">
            DeFi primitives hidden behind game mechanics - every surface reads
            real on-chain state, nothing fabricated.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {modules.map((mod, i) => (
            <motion.div
              key={mod.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="surface p-6 flex flex-col hover:border-border-default transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-5">
                <mod.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">{mod.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed mb-5 flex-1">
                {mod.desc}
              </p>
              <div className="font-mono text-[11px] text-text-muted bg-elevated border border-border rounded-lg px-3 py-1.5 inline-block self-start">
                {mod.tag}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 3. Capabilities */
function Capabilities() {
  const caps = [
    {
      icon: Zap,
      num: "01",
      benefit: "Instantly resolved bets",
      desc: "The oracle answer dispatches into our contract in the same block - no keeper, no bot, no cron. Anything the callback cannot reach in one block is swept by a permissionless settle that anyone can call.",
      badge: "Somnia Reactivity · 0x0100",
    },
    {
      icon: Repeat,
      num: "02",
      benefit: "Streaks and boss runs",
      desc: "Chain wins across back-to-back markets, or take on a 3-round Boss Battle. Every round is a real position, so a streak cannot be faked.",
      badge: "ArcadeEngine · on-chain logic",
    },
    {
      icon: Users,
      num: "03",
      benefit: "Community arenas",
      desc: "Deploy an arena with its own treasury and builder fee. DreamDEX pays it a real cut of every order routed through it.",
      badge: "CommunityDAOFactory · builder fees",
    },
  ];

  return (
    <section className="py-32 px-6 lg:px-12 border-t border-border">
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            What DreamArena does
          </h2>
          <p className="text-lg text-text-secondary max-w-md">
            The mechanism, not the marketing - what&apos;s actually happening
            on-chain.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {caps.map((cap, i) => (
            <motion.div
              key={cap.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="surface p-8 hover:border-border-default transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-8">
                <span className="text-5xl font-bold text-text-muted/20">
                  {cap.num}
                </span>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <cap.icon className="w-6 h-6" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-3">{cap.benefit}</h3>
              <p className="text-text-secondary leading-relaxed mb-6">
                {cap.desc}
              </p>
              <div className="font-mono text-xs text-text-muted bg-elevated border border-border rounded-lg px-3 py-2 inline-block">
                {cap.badge}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 4. How it works - 4 steps */
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Connect",
      desc: "Link your wallet to Somnia testnet. No KYC, no signup.",
    },
    {
      num: "02",
      title: "Predict",
      desc: "Pick a market, choose Up or Down, stake in tUSDC.",
    },
    {
      num: "03",
      title: "Win",
      desc: "Settled in the same block via Somnia Reactivity.",
    },
    {
      num: "04",
      title: "Compound",
      desc: "Roll winnings forward and build your streak multiplier.",
    },
  ];

  return (
    <section id="how-it-works" className="py-32 px-6 lg:px-12">
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            How it works
          </h2>
          <p className="text-lg text-text-secondary max-w-md">
            Four steps. No keepers. No delays. Skimmable in fifteen seconds.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="relative"
            >
              <div className="surface p-6 h-full">
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono text-sm text-primary">
                    {step.num}
                  </span>
                  {i < steps.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-text-muted" />
                  )}
                </div>
                <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 4.5. Live leaderboard preview - streaks & competition, real on-chain standings */
function LeaderboardPreview() {
  const { rows: allRows, isLoading } = useLeaderboard();
  const rows = allRows.slice(0, 5);

  return (
    <section
      id="leaderboard"
      className="py-32 px-6 lg:px-12 border-t border-border"
    >
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-wrap items-end justify-between gap-6 mb-12"
        >
          <div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-text-muted mb-3">
              Streaks · live
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Who&apos;s on a <span className="text-primary">tear</span> right
              now
            </h2>
          </div>
          <Link
            href="/app?tab=leaderboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Full leaderboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

        <div className="surface p-2 sm:p-3">
          <div className="grid grid-cols-[44px_1fr_auto] sm:grid-cols-[48px_1fr_1fr_auto] gap-3 px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-text-muted border-b border-border">
            <span>#</span>
            <span>Player</span>
            <span className="hidden sm:block">Streak</span>
            <span className="hidden sm:w-20"></span>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-text-muted">
              Reading on-chain...
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-text-muted">
              No players on the ladder yet - the first streak to survive is
              yours.
            </div>
          ) : (
            rows.map((row, i) => (
              <motion.div
                key={row.player}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{
                  duration: 0.4,
                  delay: i * 0.06,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="grid grid-cols-[44px_1fr_auto] sm:grid-cols-[48px_1fr_1fr_auto] items-center gap-3 px-4 py-3.5 border-b border-border last:border-0"
              >
                <span
                  className={`font-mono text-sm font-bold ${i === 0 ? "text-primary" : "text-text-secondary"}`}
                >
                  {i + 1}
                </span>
                <span className="font-mono text-sm text-text-primary truncate">
                  {row.player.slice(0, 6)}…{row.player.slice(-4)}
                </span>
                <span className="hidden sm:flex items-center gap-1.5 font-bold text-text-primary">
                  <Flame className="w-3.5 h-3.5 text-primary" />
                  {row.streak} in a row
                </span>
                <span className="hidden sm:w-20"></span>
              </motion.div>
            ))
          )}
        </div>

        <p className="flex items-center gap-2 font-mono text-[11px] text-text-muted mt-4">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          Read from ArcadeEngine, which the oracle&apos;s own resolution updates
          in-block.
        </p>
      </div>
    </section>
  );
}

/* 5. Architecture diagram - workflow-canvas style */
function Architecture() {
  return (
    <section
      id="architecture"
      className="py-32 px-6 lg:px-12 border-t border-border"
    >
      <div className="max-w-[1260px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            The mechanism, on the canvas
          </h2>
          <p className="text-lg text-text-secondary max-w-lg">
            Every node runs on-chain. No node is a keeper, an agent, or a human.
            Bet to payout to roll-forward - one conditional fork, then the loop
            curls back and your streak compounds into the next round.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative rounded-2xl border border-border bg-elevated p-4 sm:p-6 md:p-10"
        >
          <ArchitectureCanvas />
        </motion.div>

        {/* Legend */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />{" "}
            Nodes are contracts, all operational
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 border-t-2 border-primary" />{" "}
            Purple loop = streak compounds back into the next bet
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-6 border-t-2 border-dashed border-text-muted" />{" "}
            Dashed line = same-block flow
          </div>
        </div>
      </div>
    </section>
  );
}

/* 6. Stats strip - guarantees, not vanity */
function StatsStrip() {
  const stats = [
    { value: "1", unit: "", label: "login to start playing, no KYC" },
    { value: "Same-block", unit: "", label: "settlement, with zero keepers" },
    { value: "3", unit: "", label: "contracts, one repo, fully verified" },
    { value: "$0", unit: "", label: "exposed on-chain beyond your stake" },
  ];

  return (
    <section className="py-32 px-6 lg:px-12 border-t border-border">
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12"
        >
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-4xl sm:text-5xl font-bold mb-2">
                {stat.value}
                {stat.unit && (
                  <span className="text-lg text-text-muted ml-1">
                    {stat.unit}
                  </span>
                )}
              </div>
              <div className="text-sm font-medium uppercase tracking-wider text-text-muted">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* 7. Proof / trust - with honest disclaimer */
function ProofSection() {
  return (
    <section id="proof" className="py-32 px-6 lg:px-12 border-t border-border">
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Verified, not assumed
          </h2>
          <p className="text-lg text-text-secondary max-w-lg">
            See exactly where each bet settles. No hidden engine, no black box.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Settlement proof panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="surface p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
                <BadgeCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold">A bet, end to end</h3>
                <p className="text-xs text-text-muted">
                  Illustrative settlement trace
                </p>
              </div>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <TraceLine
                label="Approve tUSDC to ArcadeEngine"
                value="1 signature"
              />
              <TraceLine
                label="openGame: stake pulled, session opened"
                value="ArcadeEngine"
              />
              <TraceLine
                label="Price update arrives via reactive precompile 0x0100"
                value="same block"
                tint="text-warning"
              />
              <TraceLine
                label="Direction resolved against strike, streak updated"
                value="settled"
                tint="text-success"
              />
            </div>
          </motion.div>

          {/* Chain of trust */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="surface p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold">On-chain trust anchors</h3>
                <p className="text-xs text-text-muted">
                  Every contract is public and verified
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { name: "ArcadeEngine", addr: CONTRACTS.arcadeEngine },
                { name: "CommunityDAOFactory", addr: CONTRACTS.daoFactory },
                { name: "OracleHub (protocol)", addr: CONTRACTS.oracleHub },
              ]
                .filter((c) => c.addr)
                .map((c) => (
                  <a
                    key={c.name}
                    href={`https://shannon-explorer.somnia.network/address/${c.addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between bg-elevated rounded-xl px-4 py-3 hover:bg-surface transition-colors"
                  >
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="font-mono text-xs text-text-muted">
                      {c.addr.slice(0, 8)}…{c.addr.slice(-6)}
                    </span>
                  </a>
                ))}
            </div>
          </motion.div>
        </div>

        {/* Honest disclaimer */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 inline-flex items-center gap-3 px-5 py-3 rounded-xl border border-warning/20 bg-warning/5 text-warning"
        >
          <Shield className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">
            Hackathon build on the Somnia Shannon testnet - all balances are
            testnet tUSDC, not real funds.
          </span>
        </motion.div>
      </div>
    </section>
  );
}

function TraceLine({
  label,
  value,
  tint = "text-text-muted",
}: {
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-elevated border border-border rounded-xl px-4 py-3">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-bold ${tint}`}>{value}</span>
    </div>
  );
}

/* 8. Transparency - real links */
function Transparency() {
  const links = [
    {
      icon: Github,
      title: "Source code",
      desc: "The entire repo, open from day one.",
      href: "https://github.com/Saber1Y/DreamBuild",
      external: true,
    },
    {
      icon: ExternalLink,
      title: "Somnia explorer",
      desc: "Browse live transactions on the testnet.",
      href: "https://shannon-explorer.somnia.network",
      external: true,
    },
    {
      icon: BadgeCheck,
      title: "ArcadeEngine contract",
      desc: "The core arcade, verified on-chain.",
      href: `https://shannon-explorer.somnia.network/address/${CONTRACTS.arcadeEngine}`,
      external: true,
    },
  ];

  return (
    <section className="py-32 px-6 lg:px-12 border-t border-border">
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Verify it yourself
          </h2>
          <p className="text-lg text-text-secondary max-w-md">
            Don&apos;t take our word for it - open it up.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {links.map((link, i) => (
            <motion.a
              key={link.title}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="surface p-8 group hover:border-border-default transition-all duration-300 flex flex-col"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:bg-primary/20 transition-all">
                <link.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                {link.title}
                <ExternalLink className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
              </h3>
              <p className="text-text-secondary leading-relaxed">{link.desc}</p>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 9. Footer */
function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-16">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <LogoText />
            <p className="text-sm text-text-muted leading-relaxed max-w-xs">
              The prediction arcade on Somnia. Play markets, run a community
              DAO, ask the Oracle, race the leaderboard - every move settles
              on-chain.
            </p>
            <div className="flex items-center gap-2 font-mono text-xs text-text-muted">
              <span className="w-2 h-2 rounded-full bg-success pulse-fast" />
              <span>Arcade: live · Shannon testnet</span>
            </div>
          </div>

          {/* Play */}
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-widest text-text-muted mb-4">
              Play
            </h4>
            <ul className="flex flex-col gap-3 text-sm">
              <li>
                <Link
                  href="/app"
                  className="text-text-secondary hover:text-primary transition-colors"
                >
                  Launch app
                </Link>
              </li>
              <li>
                <Link
                  href="/app?tab=leaderboard"
                  className="text-text-secondary hover:text-primary transition-colors"
                >
                  Leaderboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Build */}
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-widest text-text-muted mb-4">
              Build
            </h4>
            <ul className="flex flex-col gap-3 text-sm">
              <li>
                <a
                  href="https://github.com/Saber1Y/DreamBuild"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-text-secondary hover:text-primary transition-colors"
                >
                  <Github className="w-4 h-4" /> Source
                </a>
              </li>
              <li>
                <a
                  href={`https://shannon-explorer.somnia.network/address/${CONTRACTS.arcadeEngine}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-text-secondary hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> ArcadeEngine
                </a>
              </li>
              <li>
                <a
                  href="https://shannon-explorer.somnia.network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-text-secondary hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> Explorer
                </a>
              </li>
            </ul>
          </div>

          {/* Testnet note */}
          <div className="flex flex-col gap-3">
            <h4 className="font-mono text-[11px] uppercase tracking-widest text-text-muted mb-4">
              Heads up
            </h4>
            <p className="text-sm text-text-secondary leading-relaxed">
              Hackathon build on the Somnia Shannon testnet. All balances are
              testnet tUSDC - fun to play, nothing real on the line.
            </p>
          </div>
        </div>

        <div className="mt-16 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-text-muted">
            Built for the Somnia × DreamDEX Event Contracts hackathon.
          </p>
          <div className="flex items-center gap-6 font-mono text-xs text-text-muted">
            <span>3 contracts</span>
            <span>·</span>
            <span>1 repo</span>
            <span>·</span>
            <span>same-block settlement</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
