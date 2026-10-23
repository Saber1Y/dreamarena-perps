'use client';

import { createContext, useContext, useCallback, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, CheckCircle2, Zap, Trophy } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'error' | 'reactive' | 'achievement';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  detail?: string;
  href?: string;
}

interface ToastCtx {
  push: (t: Omit<Toast, 'id'>) => void;
  toasts: Toast[];
}

const Ctx = createContext<ToastCtx>({ push: () => {}, toasts: [] });
export const useToast = () => useContext(Ctx);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = `t${counter++}`;
      setToasts((prev) => [{ ...t, id }, ...prev].slice(0, 6));
      const dur = t.type === 'achievement' || t.type === 'error' ? 9000 : 5000;
      setTimeout(() => dismiss(id), dur);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={{ push, toasts }}>
      {children}

      <div className="fixed bottom-24 right-4 z-[var(--z-toast)] md:bottom-6 flex flex-col gap-3 w-[min(340px,calc(100vw-2rem))]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={() => dismiss(t.id)}
              className={`surface overflow-hidden cursor-pointer ${iconColor(t.type)}`}
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <span className={iconWrap(t.type)}>
                  <ToastIcon type={t.type} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{t.title}</div>
                  {t.detail && (
                    <div className={`text-xs text-text-muted mt-0.5 ${t.type === 'error' ? 'line-clamp-4' : 'truncate'}`}>{t.detail}</div>
                  )}
                  {t.href && (
                    <a
                      href={t.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      View on Explorer
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

function iconColor(t: ToastType) {
  switch (t) {
    case 'success': return 'border-l-4 border-l-success';
    case 'error': return 'border-l-4 border-l-danger';
    case 'reactive': return 'border-l-4 border-l-primary';
    case 'achievement': return 'border-l-4 border-l-warning';
    default: return 'border-l-4 border-l-primary';
  }
}

function iconWrap(t: ToastType) {
  // Tint classes, not bg-x/10: Tailwind's opacity modifiers do not apply to var() colours.
  const base = 'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0';
  switch (t) {
    case 'success': return `${base} tint-success text-success`;
    case 'error': return `${base} tint-danger text-danger`;
    case 'reactive': return `${base} tint-primary text-primary`;
    case 'achievement': return `${base} tint-warning text-warning`;
    default: return `${base} bg-elevated text-text-secondary`;
  }
}

function ToastIcon({ type }: { type: ToastType }) {
  switch (type) {
    case 'success': return <CheckCircle2 className="w-4 h-4" />;
    case 'error': return <AlertTriangle className="w-4 h-4" />;
    case 'reactive': return <Zap className="w-4 h-4" />;
    case 'achievement': return <Trophy className="w-4 h-4" />;
    default: return <Info className="w-4 h-4" />;
  }
}
