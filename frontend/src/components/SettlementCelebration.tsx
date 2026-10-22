'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { usePlayerSettlement } from '@/hooks/useSettlements';

export function SettlementCelebration() {
  const { settlement, visible, dismiss } = usePlayerSettlement();

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(dismiss, 6000);
    return () => clearTimeout(t);
  }, [visible, dismiss]);

  return (
    <AnimatePresence>
      {visible && settlement && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={dismiss}
        >
          <motion.div
            initial={{ scale: 0.85, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className={`surface w-full max-w-md p-8 text-center ${settlement.won ? 'border-success/30' : 'border-danger/30'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`inline-flex items-center gap-2 mb-4 text-5xl ${settlement.won ? 'text-success' : 'text-danger'}`}>
              {settlement.won ? <TrendingUp /> : <TrendingDown />}
            </div>
            <h3 className={`text-3xl font-black ${settlement.won ? 'text-success' : 'text-danger'}`}>
              {settlement.won ? 'WON!' : 'LOST'}
            </h3>
            <p className="text-2xl font-bold text-text-primary mt-2 tabular-nums">
              {settlement.shares.toFixed(2)} shares
            </p>
            <p className="text-sm text-text-muted mt-2">
              {settlement.won
                ? `Redeem them for ${settlement.shares.toFixed(2)} tUSDC`
                : 'They expire worthless'}
            </p>
            <p className="text-xs text-text-muted mt-3">
              Settled reactively in block #{settlement.blockNumber.toString()} · streak {settlement.newStreak}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button onClick={dismiss} className="btn-primary">Continue</button>
              <a
                href={settlement.explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
              >
                View on Explorer <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
