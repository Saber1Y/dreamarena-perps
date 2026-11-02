'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, ExternalLink, LogOut, Wallet } from 'lucide-react';
import { useSttBalance } from '@/hooks/api';
import { useToast } from '@/components/toast';
import { FAUCET } from '@/lib/chain';
import { addrUrl, shortAddr, usd } from '@/lib/format';
import { useWallet } from '@/lib/wallet';

/** The player's own wallet: connect, switch to Somnia Tokyo, or see the account. */
export function WalletButton() {
  const wallet = useWallet();
  const toast = useToast();
  const stt = useSttBalance(wallet.status === 'ready' ? wallet.address : null);
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

  if (wallet.status === 'loading') return <div className="skeleton h-8 w-32" aria-hidden />;
  if (wallet.status === 'unsupported') return null;

  if (wallet.status === 'wrong-chain') {
    return (
      <button
        onClick={() => wallet.switchChain().catch(() => toast.push({ type: 'error', title: 'Network not switched', detail: 'Switch to Somnia Tokyo in your wallet.' }))}
        className="tint-warning inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-warning"
      >
        Switch to Somnia Tokyo
      </button>
    );
  }

  if (wallet.status !== 'ready' || !wallet.address) {
    return (
      <button
        onClick={() => wallet.connect().catch(() => toast.push({ type: 'error', title: 'Wallet not connected', detail: 'The request was declined or closed.' }))}
        disabled={wallet.status === 'connecting'}
        className="btn-primary h-8 px-3 text-xs"
      >
        <Wallet className="h-3.5 w-3.5" /> {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
      </button>
    );
  }

  const address = wallet.address;
  const low = stt.data !== undefined && stt.data < 0.1;
  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-2 rounded-lg border border-border-default bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-elevated"
      >
        <span className="h-2 w-2 rounded-full bg-success" />
        <span className="num">{shortAddr(address)}</span>
        {stt.data !== undefined && <span className={`num hidden sm:inline ${low ? 'text-warning' : 'text-text-muted'}`}>{usd(stt.data, 2)} STT</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="surface absolute right-0 top-10 z-[var(--z-popover)] w-[min(280px,calc(100vw-2rem))] p-2"
          >
            <div className="px-3 py-2">
              <p className="eyebrow">Playing as</p>
              <p className="num mt-0.5 text-sm font-semibold">{shortAddr(address)}</p>
              <p className={`num text-xs ${low ? 'text-warning' : 'text-text-muted'}`}>{stt.data === undefined ? '…' : `${usd(stt.data, 4)} STT`}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-elevated"
              onClick={() => {
                navigator.clipboard?.writeText(address).then(
                  () => toast.push({ type: 'success', title: 'Address copied' }),
                  () => undefined,
                );
                setOpen(false);
              }}
            >
              <Copy className="h-4 w-4 text-text-muted" /> Copy address
            </button>
            <a href={addrUrl(address)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-elevated">
              <ExternalLink className="h-4 w-4 text-text-muted" /> View on explorer
            </a>
            <a href={FAUCET} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-elevated">
              <ExternalLink className="h-4 w-4 text-text-muted" /> Get test STT
            </a>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-elevated"
              onClick={() => {
                wallet.disconnect();
                setOpen(false);
              }}
            >
              <LogOut className="h-4 w-4" /> Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
