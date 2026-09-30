'use client';

import { Check, X } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/format';
import type { Order, Payment } from '@/lib/types';

type StepState = 'done' | 'active' | 'failed' | 'upcoming' | 'skipped';

const STEPS = [
  { title: 'Order placed', failedTitle: 'Order failed' },
  { title: 'Items reserved', failedTitle: 'Items unavailable' },
  { title: 'Payment received', failedTitle: 'Payment failed' },
  { title: 'Order confirmed', failedTitle: 'Order cancelled' },
];

const FAILURE_REASONS: Record<string, string> = {
  insufficient_funds: 'Your wallet balance was too low for this order.',
};

/**
 * Maps the order's status (plus the payment record, once there is one) onto
 * the four checkout steps shown to the customer.
 */
function resolveStates(order: Order, payment: Payment | null): { states: StepState[]; failure?: string } {
  switch (order.status) {
    case 'pending':
      return { states: ['done', 'active', 'upcoming', 'upcoming'] };
    case 'awaiting_payment':
      return { states: ['done', 'done', 'active', 'upcoming'] };
    case 'confirmed':
      return { states: ['done', 'done', 'done', 'done'] };
    case 'cancelled':
      if (payment?.status === 'failed') {
        return {
          states: ['done', 'done', 'failed', 'skipped'],
          failure: (payment.failureReason && FAILURE_REASONS[payment.failureReason]) || 'The payment could not be completed. You were not charged.',
        };
      }
      return {
        states: ['done', 'failed', 'skipped', 'skipped'],
        failure: 'One or more items went out of stock. You were not charged.',
      };
  }
}

export function SagaTimeline({ order, payment }: { order: Order; payment: Payment | null }) {
  const { states, failure } = resolveStates(order, payment);

  return (
    <ol className="relative">
      {STEPS.map((step, i) => {
        const state = states[i];
        const last = i === STEPS.length - 1;
        return (
          <li key={step.title} className="relative flex gap-4 pb-7 last:pb-0">
            {!last && (
              <div className="absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-px bg-line">
                <motion.div
                  className="h-full w-full origin-top bg-success"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: state === 'done' && states[i + 1] !== 'skipped' ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            )}
            <StepIcon state={state} />
            <div className={cn('min-w-0 flex-1 pt-1', (state === 'skipped' || state === 'upcoming') && 'opacity-50')}>
              <p className={cn('text-sm font-semibold', state === 'failed' ? 'text-danger' : 'text-fg')}>
                {state === 'failed' ? step.failedTitle : step.title}
              </p>
              {state === 'active' && <p className="mt-0.5 text-xs text-accent">In progress</p>}
              {state === 'failed' && failure && <p className="mt-1 text-sm text-muted">{failure}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepIcon({ state }: { state: StepState }) {
  const base = 'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border';
  if (state === 'done') {
    return (
      <span className={cn(base, 'border-success bg-success text-white')}>
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className={cn(base, 'border-danger bg-danger text-white')}>
        <X className="h-4 w-4" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className={cn(base, 'border-accent bg-accent-soft')}>
        <span className="animate-ping-soft absolute h-3 w-3 rounded-full bg-accent" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
    );
  }
  return <span className={cn(base, 'border-dashed border-line-strong bg-white')} />;
}
