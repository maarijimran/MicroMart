'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/format';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
}

export function QuantityStepper({ value, onChange, min = 1, max = 999, size = 'md' }: QuantityStepperProps) {
  const h = size === 'sm' ? 'h-8' : 'h-11';
  const btn = cn(
    'focus-ring flex items-center justify-center rounded-lg text-muted transition-colors hover:bg-accent-soft hover:text-fg disabled:opacity-30',
    size === 'sm' ? 'h-6 w-6' : 'h-8 w-8',
  );
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-xl border border-line bg-elevated/70 px-1', h)}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Decrease">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.floor(next))));
        }}
        className={cn('w-9 bg-transparent text-center font-medium tabular-nums outline-none', size === 'sm' ? 'text-xs' : 'text-sm')}
        aria-label="Quantity"
      />
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
