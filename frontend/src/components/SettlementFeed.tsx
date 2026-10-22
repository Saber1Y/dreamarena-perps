'use client';

import { useSettlements } from '@/hooks/useSettlements';
import { Link2, TrendingUp, TrendingDown, Radio } from 'lucide-react';
import { Avatar } from '@/components/Avatar';

function shortAddr(a: string) {
  return `${a.slice(0, 4)}...${a.slice(-2)}`;
}

export function SettlementFeed() {
  const { settlements, loading } = useSettlements();

  return (
    <div className="surface overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Radio className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-sm">Reactive Settlements</h3>
        <span className="text-xs text-text-muted font-medium">
          {loading ? 'Scanning chain...' : 'Same-block, on-chain'}
        </span>
      </div>

      {settlements.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-text-muted">
          Awaiting the first settlement. Every row here is emitted from inside a reactive
          callback — the oracle answers, the 0x0100 precompile dispatches, the engine resolves.
        </div>
      ) : (
        <div className="relative">
          <div className="flex overflow-x-auto gap-3 px-6 py-4">
            {settlements.map((s) => (
              <a
                key={`${s.marketId}:${s.player}:${s.txHash}`}
                href={s.explorer}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 min-w-max transition-colors ${
                  s.won ? 'border-success/30 bg-success/5 hover:bg-success/10' : 'border-danger/30 bg-danger/5 hover:bg-danger/10'
                }`}
              >
                <span className={`flex items-center gap-1 text-xs font-mono ${s.won ? 'text-success' : 'text-danger'}`}>
                  {s.won ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {s.won ? 'WON' : 'LOST'}
                </span>
                <span className="text-xs font-mono text-text-muted">#{s.blockNumber.toString()}</span>
                <span className="text-sm font-bold tabular-nums">
                  {s.shares.toFixed(2)}
                </span>
                <span className="text-xs text-text-muted">shares</span>
                <Avatar address={s.player} size={20} className="shrink-0" />
                <span className="text-xs font-mono text-text-muted">{shortAddr(s.player)}</span>
                <Link2 className="w-3.5 h-3.5 text-text-muted" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
