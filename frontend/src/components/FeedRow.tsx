'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Flag, Flame, Play, Skull, Timer, Zap } from 'lucide-react';
import type { FeedEvent } from '@/lib/types';
import { ago, pnl, pnlTone, shortAddr, shortHash, txUrl } from '@/lib/format';

const STATUS_TONE: Record<string, string> = {
  Won: 'badge-success',
  Lost: 'badge-danger',
  Ended: 'badge-muted',
};

function Icon({ e }: { e: FeedEvent }) {
  const box = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg';
  if (e.kind === 'Reacted') {
    return e.trigger?.source === 'Schedule' ? (
      <span className={`${box} tint-primary text-primary`}><Timer className="h-4 w-4" /></span>
    ) : (
      <span className={`${box} tint-primary text-primary`}><Zap className="h-4 w-4" /></span>
    );
  }
  if (e.kind === 'TradeScored') return <span className={`${box} ${e.won ? 'tint-success text-success' : 'tint-danger text-danger'}`}><Flame className="h-4 w-4" /></span>;
  if (e.kind === 'Liquidated') return <span className={`${box} tint-danger text-danger`}><Skull className="h-4 w-4" /></span>;
  if (e.kind === 'RunStarted') return <span className={`${box} bg-elevated text-text-secondary`}><Play className="h-4 w-4" /></span>;
  return <span className={`${box} bg-elevated text-text-secondary`}><Flag className="h-4 w-4" /></span>;
}

function Title({ e }: { e: FeedEvent }) {
  switch (e.kind) {
    case 'RunStarted':
      return <>Started a <b>{e.game}</b> run{e.symbol ? <> on {e.symbol}</> : null}</>;
    case 'Reacted':
      if (e.trigger?.source === 'Schedule') return <>Deadline callback settled the run</>;
      if (e.trigger?.source === 'PositionLiquidated') return <>Liquidation reached the arena</>;
      return <>Position change reached the arena</>;
    case 'TradeScored':
      return (
        <>
          Trade scored <span className={`num font-semibold ${pnlTone(e.pnl)}`}>{pnl(e.pnl)}</span> · {e.won ? `win ${e.wins}` : 'loss'}
        </>
      );
    case 'Liquidated':
      return <>Liquidated{e.symbol ? <> on {e.symbol}</> : null}</>;
    case 'RunFinished':
      return (
        <>
          {e.game} run <span className={STATUS_TONE[e.status ?? ''] ?? 'badge-muted'}>{e.status}</span>
          {e.wins ? <> · {e.wins} win{e.wins === 1 ? '' : 's'}</> : null}
        </>
      );
  }
}

/** One arena event. Callbacks carry their own proof: the trade and the callback, and the block they share. */
export function FeedRow({ e, showPlayer = true, now }: { e: FeedEvent; showPlayer?: boolean; now: number }) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="flex gap-3 py-3"
    >
      <Icon e={e} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm text-text-primary">
            <Title e={e} />
          </p>
          <span className="num shrink-0 text-[11px] text-text-muted" title={new Date(e.time).toLocaleString()}>
            {ago(e.time, now)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
          {showPlayer && (
            <Link href={`/app?tab=profile&player=${e.player}`} className="num hover:text-primary">
              {shortAddr(e.player)}
            </Link>
          )}
          <span className="num">block {e.block.toLocaleString('en-US')}</span>
          {e.kind === 'Reacted' && e.trigger?.orderTx && (
            <a href={txUrl(e.trigger.orderTx)} target="_blank" rel="noopener noreferrer" className="num hover:text-primary">
              trade {shortHash(e.trigger.orderTx)}
            </a>
          )}
          <a href={txUrl(e.tx)} target="_blank" rel="noopener noreferrer" className="num hover:text-primary">
            {e.kind === 'Reacted' ? 'callback' : 'tx'} {shortHash(e.tx)}
          </a>
          {e.kind === 'Reacted' && e.trigger?.source !== 'Schedule' && (
            <span className={e.trigger?.sameBlock ? 'badge-success' : 'badge-muted'}>
              {e.trigger?.sameBlock ? 'same block as the trade' : 'trade not found in block'}
            </span>
          )}
          {e.kind === 'Reacted' && e.trigger?.source === 'Schedule' && e.trigger.lateBySeconds !== undefined && (
            <span className="badge-success">
              {e.trigger.lateBySeconds <= 0 ? 'at the deadline second' : `${e.trigger.lateBySeconds}s after the deadline`}
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
}
