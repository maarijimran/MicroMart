import type { ReactNode } from 'react';
import { cn } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-line text-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export const STATUS_META: Record<OrderStatus, { label: string; tone: Tone; live: boolean }> = {
  pending: { label: 'Reserving stock', tone: 'accent', live: true },
  awaiting_payment: { label: 'Awaiting payment', tone: 'warning', live: true },
  confirmed: { label: 'Confirmed', tone: 'success', live: false },
  cancelled: { label: 'Cancelled', tone: 'danger', live: false },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone}>
      <span className="relative flex h-1.5 w-1.5">
        {meta.live && <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-current" />}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {meta.label}
    </Badge>
  );
}
