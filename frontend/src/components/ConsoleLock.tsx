'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Lock, LockOpen } from 'lucide-react';
import { useLock, useSession, useUnlock } from '@/hooks/api';

/**
 * Trading and runs act on a real wallet through the linked bot, so they unlock
 * with the console passphrase. Reads never need it.
 */
export function ConsoleLock() {
  const session = useSession();
  const unlock = useUnlock();
  const lock = useLock();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!session.data) return <div className="skeleton h-8 w-24" aria-hidden />;
  if (!session.data.configured) {
    return (
      <span className="badge-muted h-8 px-3" title="No passphrase, bot key or owner is configured on this deployment.">
        <Lock className="h-3.5 w-3.5" /> Read-only
      </span>
    );
  }

  if (session.data.unlocked) {
    return (
      <button
        onClick={() => lock.mutate()}
        className="tint-primary inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-primary-hover transition-opacity hover:opacity-80"
        title="Lock the console"
      >
        <LockOpen className="h-3.5 w-3.5" /> Unlocked
      </button>
    );
  }

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-default bg-surface px-3 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary"
      >
        <Lock className="h-3.5 w-3.5" /> Unlock to trade
      </button>
      <AnimatePresence>
        {open && (
          <motion.form
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onSubmit={(e) => {
              e.preventDefault();
              unlock.mutate(value, {
                onSuccess: () => {
                  setValue('');
                  setOpen(false);
                },
              });
            }}
            className="surface absolute right-0 top-10 z-[var(--z-popover)] w-[min(320px,calc(100vw-2rem))] p-4"
          >
            <label htmlFor="console-passphrase" className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" /> Console passphrase
            </label>
            <p className="mt-1 text-xs text-text-muted">
              Lets this browser trade {shortOwner(session.data.owner)} through the linked bot for 12 hours.
            </p>
            <input
              ref={field}
              id="console-passphrase"
              type="password"
              autoComplete="current-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input mt-3"
              placeholder="Passphrase"
            />
            {unlock.error && <p className="mt-2 text-xs font-medium text-danger">{unlock.error.message}</p>}
            <button type="submit" disabled={!value || unlock.isPending} className="btn-primary mt-3 w-full">
              {unlock.isPending ? 'Checking…' : 'Unlock'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

const shortOwner = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'the Arena wallet');
