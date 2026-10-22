'use client';

import { AlertTriangle } from 'lucide-react';
import { isDeployed } from '@/lib/web3';

/**
 * The arcade's markets and books are the protocol's and work regardless, but
 * streaks, the leaderboard, and arenas need OUR contracts. Say so plainly
 * rather than rendering empty panels that read as "nobody has played yet".
 */
export function DeployBanner() {
  if (isDeployed) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning mb-6">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div>
        <span className="font-medium">Arcade contracts are not configured.</span>{' '}
        Live markets and odds below are real and load fine, but streaks, the leaderboard, and
        arenas stay empty until <code className="font-mono text-xs">NEXT_PUBLIC_ARCADE_ENGINE</code>{' '}
        and <code className="font-mono text-xs">NEXT_PUBLIC_DAO_FACTORY</code> are set from the
        deploy output.
      </div>
    </div>
  );
}
