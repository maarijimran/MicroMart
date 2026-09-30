import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, tone = 'neutral', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div
        className={cn(
          'mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-line shadow-card',
          tone === 'danger' ? 'bg-danger-soft text-danger' : 'glass text-accent',
        )}
      >
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <div className="mt-1.5 max-w-sm text-sm text-muted">{description}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
