'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/format';

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — the value is still visible to select by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        'focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
        copied ? 'text-success' : 'text-muted hover:bg-accent-soft hover:text-fg',
        className,
      )}
      aria-label={label}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}
