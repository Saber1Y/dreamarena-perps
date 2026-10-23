'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isAddress } from 'viem';
import { AppShell, TABS, type Tab } from '@/components/AppShell';
import { ArenaTab } from '@/components/ArenaTab';
import { AgentTab } from '@/components/AgentTab';
import { LeaderboardTab } from '@/components/LeaderboardTab';
import { ProfileTab } from '@/components/ProfileTab';
import { MonitorTab } from '@/components/MonitorTab';

const TITLES: Record<Tab, { title: string; sub: string }> = {
  arena: { title: 'Arena', sub: 'Trade real dreamDEX perps and let the chain score your run.' },
  agent: { title: 'Agent', sub: 'The MCP agent behind every order here, with its hard limits.' },
  leaderboard: { title: 'Leaderboard', sub: 'Every player who has started a run, ranked from on-chain stats.' },
  profile: { title: 'Profile', sub: 'A player’s on-chain record.' },
  monitor: { title: 'Monitor', sub: 'Reactivity callbacks as they land, with same-block proof.' },
};

function Console() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get('tab');
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'arena';
  const player = params.get('player');

  const select = (next: Tab) => router.replace(`${pathname}?tab=${next}`, { scroll: false });

  return (
    <AppShell tab={tab} onTab={select}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{TITLES[tab].title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{TITLES[tab].sub}</p>
      </div>
      {tab === 'arena' && <ArenaTab />}
      {tab === 'agent' && <AgentTab />}
      {tab === 'leaderboard' && <LeaderboardTab />}
      {tab === 'profile' && <ProfileTab player={player && isAddress(player) ? player : null} />}
      {tab === 'monitor' && <MonitorTab />}
    </AppShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh]" />}>
      <Console />
    </Suspense>
  );
}
