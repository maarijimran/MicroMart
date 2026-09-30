'use client';

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';

type Tone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
  action?: { label: string; href: string };
}

type ToastInput = Omit<Toast, 'id' | 'tone'> & { tone?: Tone };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const ICON_COLORS = { success: 'text-success', error: 'text-danger', info: 'text-accent' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev.slice(-3), { tone: 'info', ...input, id }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-surface-strong p-4 shadow-float"
                role="status"
              >
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_COLORS[toast.tone])} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{toast.title}</p>
                  {toast.description && <p className="mt-0.5 text-xs text-muted">{toast.description}</p>}
                  {toast.action && (
                    <Link
                      href={toast.action.href}
                      onClick={() => dismiss(toast.id)}
                      className="mt-2 inline-block text-xs font-semibold text-accent hover:underline"
                    >
                      {toast.action.label} →
                    </Link>
                  )}
                </div>
                <button onClick={() => dismiss(toast.id)} className="text-subtle hover:text-fg" aria-label="Dismiss">
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
