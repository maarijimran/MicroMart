'use client';

import { Boxes, Nfc, ServerCrash, WalletMinimal } from 'lucide-react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, Skeleton } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { formatMoney, relativeTime } from '@/lib/format';
import type { Wallet } from '@/lib/types';

function AnimatedMoney({ value, currency }: { value: number; currency: string }) {
  const amount = useMotionValue(0);
  const text = useTransform(amount, (v) => formatMoney(v, currency));
  useEffect(() => {
    const controls = animate(amount, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [amount, value]);
  return <motion.span>{text}</motion.span>;
}

function WalletView() {
  const { auth } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not-seeded' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!auth) return;
    api
      .getMyWallet(auth.accessToken)
      .then((w) => {
        setWallet(w);
        setState('ready');
      })
      .catch((err) => setState(err instanceof ApiError && err.status === 404 ? 'not-seeded' : 'error'));
  }, [auth, reloadKey]);

  if (!auth) return null;

  if (state === 'error') {
    return (
      <EmptyState
        tone="danger"
        icon={ServerCrash}
        title="Your wallet couldn’t be loaded"
        description="Please try again in a moment."
        action={<Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>}
      />
    );
  }

  if (state === 'not-seeded') {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={WalletMinimal}
          title="Your wallet isn’t active yet"
          description="Share your account ID with support to activate it."
          action={
            <div className="flex max-w-full items-center gap-2 rounded-lg border border-line bg-white py-1.5 pl-3 pr-1.5">
              <code className="truncate font-mono text-xs text-fg">{auth.user.id}</code>
              <CopyButton value={auth.user.id} />
            </div>
          }
        />
      </Card>
    );
  }

  if (state === 'loading' || !wallet) {
    return (
      <div className="grid gap-6 lg:grid-cols-[26rem_1fr]">
        <Skeleton className="aspect-[1.6] rounded-3xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[26rem_1fr]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative aspect-[1.6] w-full max-w-[26rem] overflow-hidden rounded-2xl bg-accent p-5 text-white sm:p-7"
      >
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full border-[28px] border-white/10" aria-hidden />
        <div className="relative flex h-full flex-col">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Boxes className="h-4 w-4" /> MicroMart
            </span>
            <Nfc className="h-5 w-5 opacity-80" />
          </div>
          <div className="mt-auto">
            <p className="text-xs uppercase tracking-[0.18em] text-white/70">Available balance</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
              <AnimatedMoney value={wallet.balance} currency={wallet.currency} />
            </p>
            <div className="mt-5 flex items-end justify-between text-xs text-white/75">
              <span className="truncate pr-4">{auth.user.email}</span>
              <span className="font-mono">{wallet.currency}</span>
            </div>
          </div>
        </div>
      </motion.div>

      <div>
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold text-fg">Details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="shrink-0 text-muted">Account ID</dt>
              <dd className="flex min-w-0 items-center gap-1">
                <code className="truncate font-mono text-xs text-fg">{auth.user.id}</code>
                <CopyButton value={auth.user.id} label="Copy" />
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Last updated</dt>
              <dd className="text-fg">{relativeTime(wallet.updatedAt)}</dd>
            </div>
          </dl>
          <ButtonLink href="/" className="mt-6 w-full" variant="secondary">
            Continue shopping
          </ButtonLink>
        </Card>
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <ProtectedRoute>
      <PageHeader title="Wallet" />
      <WalletView />
    </ProtectedRoute>
  );
}
