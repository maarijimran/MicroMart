'use client';

import { ChevronDown, Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/format';

const control =
  'h-11 w-full rounded-xl border border-line bg-elevated/70 px-3.5 text-sm text-fg placeholder:text-subtle transition-all outline-none hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent-soft';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  icon?: LucideIcon;
  trailing?: ReactNode;
}

export function Field({ label, hint, error, icon: Icon, trailing, className, type, id, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />}
        <input
          id={inputId}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={!!error}
          className={cn(control, Icon && 'pl-10', (isPassword || !!trailing) && 'pr-11', error && 'border-danger')}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="focus-ring absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-subtle hover:text-fg"
            aria-label={reveal ? 'Hide password' : 'Show password'}
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : (
          trailing && <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : hint && <div className="text-xs text-subtle">{hint}</div>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
}

export function Select({ label, hint, className, id, children, ...props }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <select id={selectId} className={cn(control, 'cursor-pointer appearance-none pr-9')} {...props}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
      {hint && <div className="text-xs text-subtle">{hint}</div>}
    </div>
  );
}
