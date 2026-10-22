'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { publicClient } from '@/lib/dreamdex';
import { ARCADE_ENGINE_ABI } from '@/lib/abis';
import { CONTRACTS, isDeployed } from '@/lib/web3';
import type { Address } from 'viem';

const ENGINE = CONTRACTS.arcadeEngine as Address;

export function MilestoneCelebration() {
  const { address } = useAccount();
  const [milestone, setMilestone] = useState<{ wins: number; multiplier: number } | null>(null);
  const [boss, setBoss] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const lastKey = useRef<string>('');

  useEffect(() => {
    if (!address || !isDeployed) return;
    const unwatch = publicClient.watchContractEvent({
      address: ENGINE,
      abi: ARCADE_ENGINE_ABI,
      eventName: 'MilestoneReached',
      args: { player: address },
      onLogs: (logs: any[]) => {
        logs.forEach((log) => {
          const { milestone: reached, multiplier } = log.args ?? {};
          const key = `${reached?.toString() ?? ''}:${log.transactionHash ?? ''}`;
          if (key === lastKey.current) return;
          lastKey.current = key;
          setMilestone({
            wins: reached ? Number(reached) : 0,
            multiplier: multiplier ? Number(multiplier) / 100 : 1,
          });
          setVisible(true);
        });
      },
    });
    const unwatchBoss = publicClient.watchContractEvent({
      address: ENGINE,
      abi: ARCADE_ENGINE_ABI,
      eventName: 'BossDefeated',
      args: { player: address },
      onLogs: (logs: any[]) => {
        const last = logs[logs.length - 1];
        if (!last) return;
        setBoss(Number(last.args?.totalSlain ?? 1));
        setVisible(true);
      },
    });

    return () => {
      unwatch?.();
      unwatchBoss?.();
    };
  }, [address]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      setVisible(false);
      setBoss(null);
    }, 7000);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (boss !== null || milestone) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16 }}
            className="surface w-full max-w-md p-10 text-center border-warning/30"
          >
            <div className="text-6xl mb-4">{boss !== null ? '⚔️' : '🏆'}</div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-warning mb-2">
              {boss !== null ? 'Boss defeated' : 'Milestone reached'}
            </div>
            {boss !== null ? (
              <>
                <h3 className="text-3xl font-black">BOSS SLAIN</h3>
                <p className="text-2xl font-bold text-primary mt-3">
                  {boss} {boss === 1 ? 'boss' : 'bosses'} down
                </p>
                <p className="text-sm text-text-muted mt-3">
                  Three straight calls, all settled on-chain.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-3xl font-black">{milestone!.wins} IN A ROW!</h3>
                <p className="text-2xl font-bold text-primary mt-3">
                  {milestone!.multiplier.toFixed(2)}x multiplier unlocked
                </p>
                <p className="text-sm text-text-muted mt-3">Keep the streak alive to reach the next tier.</p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
