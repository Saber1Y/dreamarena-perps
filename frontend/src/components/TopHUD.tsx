'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Flame, Coins, Fuel, Bell, X } from 'lucide-react';
import { useBalances } from '@/hooks/useBalances';
import { usePlayerStats } from '@/hooks/useContracts';
import { useToast } from '@/components/toast';
import { RollingNumber } from '@/components/RollingNumber';
import { Logo } from '@/components/Logo';

export function TopHUD() {
  const { tusdc, stt, isConnected } = useBalances();
  const { streak } = usePlayerStats();
  const { toasts } = useToast();
  const [notifsOpen, setNotifsOpen] = useState(false);

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Back to the DreamArena landing page"
            title="Back to the landing page"
          >
            <Logo className="w-7 h-7" />
            <span className="hidden sm:inline text-xs font-bold tracking-tight">DreamArena</span>
          </Link>
          <div className="w-px h-5 bg-border hidden sm:block" />
          <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="hidden sm:inline">Live</span>
            <span className="hidden sm:inline">·</span>
            <span className="font-mono hidden md:inline">Shannon testnet</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* tUSDC */}
          <div className="flex items-center gap-1.5 rounded-full bg-elevated border border-border px-3 py-1.5" title="tUSDC balance">
            <Coins className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-bold tabular-nums">
              {isConnected ? <RollingNumber value={tusdc} /> : '--.--'}
            </span>
            <span className="text-[11px] text-text-muted hidden sm:inline">tUSDC</span>
          </div>

          {/* STT */}
          <div className={`flex items-center gap-1.5 rounded-full bg-elevated border border-border px-3 py-1.5 ${stt < 32 ? 'text-warning' : ''}`} title="STT gas balance">
            <Fuel className="w-3.5 h-3.5" />
            <span className="text-sm font-bold tabular-nums">
              {isConnected ? stt.toFixed(2) : '--.--'}
            </span>
            <span className="text-[11px] text-text-muted hidden sm:inline">STT</span>
          </div>

          {/* Streak */}
          <div className="flex items-center gap-1.5 rounded-full bg-elevated border border-border px-3 py-1.5" title="Current streak">
            <Flame className="w-3.5 h-3.5 text-danger" />
            <span className="text-sm font-bold tabular-nums">{isConnected ? streak : '--'}</span>
          </div>

          {/* Notification bell */}
          <button
            onClick={() => setNotifsOpen((o) => !o)}
            className="relative flex items-center justify-center w-8 h-8 rounded-full bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {toasts.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger" />
            )}
          </button>
        </div>

        <AnimatePresence>
          {notifsOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute right-4 top-14 w-72 surface p-4 shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold">Notifications</span>
                <button onClick={() => setNotifsOpen(false)} className="text-text-muted hover:text-text-primary">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {toasts.length === 0 ? (
                <p className="text-sm text-text-muted">No notifications yet.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {toasts.map((t) => (
                    <div key={t.id} className="text-xs bg-elevated border border-border rounded-lg px-3 py-2">
                      <div className="font-bold">{t.title}</div>
                      {t.detail && <div className="text-text-muted">{t.detail}</div>}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
