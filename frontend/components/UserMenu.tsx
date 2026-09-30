'use client';

import { ChevronDown, LogOut, Package, Shield, ShoppingCart, User, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/context/ToastContext';
import { initials } from '@/lib/format';

export function UserMenu() {
  const { auth, logout } = useAuth();
  const { itemCount } = useCart();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!auth) return null;

  async function handleLogout() {
    setOpen(false);
    await logout();
    toast({ title: 'Signed out' });
    router.push('/');
  }

  const displayName = auth.user.email.split('@')[0];
  const items = [
    { href: '/orders', label: 'My orders', icon: Package },
    { href: '/cart', label: 'My cart', icon: ShoppingCart, badge: itemCount },
    { href: '/wallet', label: 'My wallet', icon: Wallet },
    ...(auth.user.role === 'admin' ? [{ href: '/admin', label: 'Admin console', icon: Shield }] : []),
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="focus-ring flex h-11 items-center gap-2.5 rounded-lg bg-panel pl-1.5 pr-3 hover:bg-line"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-xs font-bold text-accent">
          {initials(auth.user.email)}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium text-fg lg:block">{displayName}</span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-60 rounded-xl border border-line bg-white py-2 shadow-float">
          <div className="flex items-center gap-2.5 px-4 pb-3 pt-1">
            <User className="h-4 w-4 text-accent" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{displayName}</p>
              <p className="truncate text-xs capitalize text-subtle">{auth.user.role} account</p>
            </div>
          </div>
          <div className="border-t border-line pt-1">
            {items.map(({ href, label, icon: Icon, badge }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-fg hover:bg-panel"
              >
                <Icon className="h-4 w-4 text-accent" />
                <span className="flex-1">{label}</span>
                {!!badge && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{badge > 9 ? '9+' : badge}</span>
                )}
              </Link>
            ))}
          </div>
          <div className="mt-1 border-t border-line pt-1">
            <button onClick={() => void handleLogout()} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-fg hover:bg-panel">
              <LogOut className="h-4 w-4 text-accent" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
