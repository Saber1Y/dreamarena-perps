'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Copy, ExternalLink, KeyRound, LogOut, Trash2 } from 'lucide-react';
import { useSttBalance } from '@/hooks/api';
import { useToast } from '@/components/toast';
import { addrUrl, shortAddr, usd } from '@/lib/format';
import { useLinkedBot } from '@/lib/linkedBot';

/** Playing as a dreamDEX wallet through the bot this browser holds. */
export function LinkedBotButton() {
  const linked = useLinkedBot();
  const toast = useToast();
  const gas = useSttBalance(linked.bot);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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

  if (linked.status !== 'ready' || !linked.player || !linked.bot) return null;
  const { player, bot } = linked;
  const low = gas.data !== undefined && gas.data < 0.1;
  const copy = (text: string, title: string) =>
    navigator.clipboard?.writeText(text).then(
      () => toast.push({ type: 'success', title }),
      () => undefined,
    );

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-2 rounded-lg border border-border-default bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-elevated"
      >
        <Bot className="h-3.5 w-3.5 text-primary" />
        <span className="num">{shortAddr(player)}</span>
        {gas.data !== undefined && <span className={`num hidden sm:inline ${low ? 'text-warning' : 'text-text-muted'}`}>gas {usd(gas.data, 2)}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="surface absolute right-0 top-10 z-[var(--z-popover)] w-[min(300px,calc(100vw-2rem))] p-2"
          >
            <div className="space-y-2 px-3 py-2">
              <div>
                <p className="eyebrow">Playing as</p>
                <a href={addrUrl(player)} target="_blank" rel="noopener noreferrer" className="num text-sm font-semibold hover:text-primary">
                  {shortAddr(player)}
                </a>
              </div>
              <div>
                <p className="eyebrow">Through your bot</p>
                <p className="num text-sm">{shortAddr(bot)}</p>
                <p className={`num text-xs ${low ? 'text-warning' : 'text-text-muted'}`}>
                  {gas.data === undefined ? '…' : `${usd(gas.data, 4)} STT for gas and credit`}
                </p>
              </div>
            </div>
            <div className="my-1 h-px bg-border" />
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-elevated" onClick={() => copy(bot, 'Bot address copied')}>
              <Copy className="h-4 w-4 text-text-muted" /> Copy bot address
            </button>
            <a href={addrUrl(bot)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-elevated">
              <ExternalLink className="h-4 w-4 text-text-muted" /> Bot on explorer
            </a>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-elevated"
              onClick={() => {
                const key = linked.exportKey();
                if (key && window.confirm('Copy the bot key? Anyone with it can trade your dreamDEX wallet (never withdraw). Keep it private.')) {
                  void copy(key, 'Bot key copied');
                }
              }}
            >
              <KeyRound className="h-4 w-4 text-text-muted" /> Export bot key
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-elevated"
              onClick={() => {
                linked.unlink();
                setOpen(false);
              }}
            >
              <LogOut className="h-4 w-4 text-text-muted" /> Stop playing
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-elevated"
              onClick={() => {
                if (window.confirm('Delete this bot from the browser? Unlink it in dreamDEX too, and export the key first if it still holds STT.')) {
                  linked.forget();
                  setOpen(false);
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete bot
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
