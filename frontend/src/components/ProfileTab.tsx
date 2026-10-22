'use client';

import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { Coins, Flame, Gamepad2, Percent, TrendingUp } from 'lucide-react';
import { usePlayerStats } from '@/hooks/useContracts';
import { useBalances } from '@/hooks/useBalances';
import { ClaimCard } from '@/components/ClaimCard';
import { PendingEntries } from '@/components/PendingEntries';
import { ConnectButton } from '@/components/ConnectButton';
import { Avatar } from '@/components/Avatar';

function shortAddr(a?: string) {
  if (!a) return '';
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export function ProfileTab() {
  const { address, isConnected } = useAccount();
  const { streak, longestStreak, multiplier, wins, played, winRate, totalShares, bossesSlain } =
    usePlayerStats();
  const { tusdc } = useBalances();

  const stats = [
    { icon: Coins, label: 'tUSDC Balance', value: `$${tusdc.toFixed(2)}` },
    { icon: Percent, label: 'Win Rate', value: `${winRate}%` },
    { icon: Gamepad2, label: 'Games Played', value: `${played}` },
    { icon: Flame, label: 'Win Streak', value: `${streak}` },
  ];

  // Every threshold is an on-chain counter, so progress is real and unfakeable.
  const achievements = [
    { icon: '🎯', title: 'First Blood', desc: 'Win your first market', at: wins, of: 1 },
    { icon: '🔥', title: 'Hat Trick', desc: 'Win 3 back to back', at: longestStreak, of: 3 },
    { icon: '⚡', title: 'On Fire', desc: 'Win 7 back to back', at: longestStreak, of: 7 },
    { icon: '👑', title: 'Untouchable', desc: 'Win 30 back to back', at: longestStreak, of: 30 },
    { icon: '⚔️', title: 'Boss Slayer', desc: 'Beat a 3-round Boss Battle', at: bossesSlain, of: 1 },
    { icon: '🗡️', title: 'Boss Hunter', desc: 'Slay 5 bosses', at: bossesSlain, of: 5 },
    { icon: '🎰', title: 'Regular', desc: 'Play 25 markets', at: played, of: 25 },
    { icon: '💎', title: 'Whale', desc: 'Hold 1,000 shares all-time', at: Math.floor(totalShares), of: 1000 },
  ].map((a) => ({ ...a, unlocked: a.at >= a.of, progress: Math.min(1, a.at / a.of) }));

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="space-y-6">
      {!isConnected ? (
        <div className="surface p-10 text-center">
          <h3 className="font-bold mb-2">Connect your wallet</h3>
          <p className="text-sm text-text-muted mb-6">Link a wallet to view your on-chain player card.</p>
          <div className="flex justify-center"><ConnectButton /></div>
        </div>
      ) : (
        <>
          <section className="surface p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <Avatar address={address} size={64} className="shrink-0" />
            <div className="flex-1">
              <div className="text-lg font-bold font-mono">{shortAddr(address)}</div>
              <div className="text-sm text-text-muted mt-1 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" />
                {multiplier.toFixed(2)}x multiplier · best streak {longestStreak}{bossesSlain > 0 ? ` · ⚔️ ${bossesSlain}` : ''}
              </div>
            </div>
          </section>

          <PendingEntries />

          <ClaimCard />

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="surface p-5">
                <stat.icon className="w-5 h-5 text-primary mb-3" />
                <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
                <div className="text-xs text-text-muted mt-1">{stat.label}</div>
              </div>
            ))}
          </section>

          <section className="surface p-6">
            <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
              <h3 className="font-bold">Achievements</h3>
              <span className="text-xs font-medium text-text-muted tabular-nums">
                {unlockedCount} of {achievements.length} unlocked
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {achievements.map((a) => (
                <motion.div
                  key={a.title}
                  whileHover={{ y: -2 }}
                  className={`rounded-xl border p-4 transition-colors ${
                    a.unlocked
                      ? 'border-success/30 bg-success/5'
                      : 'border-border bg-elevated'
                  }`}
                >
                  <div className={`text-2xl mb-2 ${a.unlocked ? '' : 'grayscale opacity-40'}`}>
                    {a.icon}
                  </div>
                  <div className="font-bold text-sm mb-1">{a.title}</div>
                  <div className="text-xs text-text-muted mb-3">{a.desc}</div>

                  {a.unlocked ? (
                    <div className="text-[11px] font-bold text-success">UNLOCKED</div>
                  ) : (
                    <>
                      <div className="h-1 rounded-full bg-border overflow-hidden">
                        <motion.div
                          className="h-full bg-primary/60"
                          initial={{ width: 0 }}
                          animate={{ width: `${a.progress * 100}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                        />
                      </div>
                      <div className="text-[11px] text-text-muted mt-1.5 tabular-nums">
                        {Math.min(a.at, a.of)} / {a.of}
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
