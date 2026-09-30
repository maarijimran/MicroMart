'use client';

import { ChevronRight, Package, ServerCrash } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ProductArt } from '@/components/ProductArt';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { StatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, Skeleton } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import * as api from '@/lib/api';
import { cn, formatMoney, relativeTime, shortId } from '@/lib/format';
import type { Order } from '@/lib/types';

type Filter = 'all' | 'active' | 'confirmed' | 'cancelled';

const FILTERS: { id: Filter; label: string; match: (o: Order) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'active', label: 'In progress', match: (o) => o.status === 'pending' || o.status === 'awaiting_payment' },
  { id: 'confirmed', label: 'Confirmed', match: (o) => o.status === 'confirmed' },
  { id: 'cancelled', label: 'Cancelled', match: (o) => o.status === 'cancelled' },
];

function OrdersList() {
  const { auth } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!auth) return;
    api
      .listOrders(auth.accessToken)
      .then((res) => {
        setOrders(res.orders);
        setError(false);
      })
      .catch(() => setError(true));
  }, [auth, reloadKey]);

  if (error) {
    return (
      <EmptyState
        tone="danger"
        icon={ServerCrash}
        title="Your orders couldn’t be loaded"
        description="Please try again in a moment."
        action={<Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>}
      />
    );
  }

  if (!orders) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="You haven’t placed any orders yet."
          action={<ButtonLink href="/">Start shopping</ButtonLink>}
        />
      </Card>
    );
  }

  const visible = orders.filter(FILTERS.find((f) => f.id === filter)!.match);

  return (
    <div>
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-line p-1 sm:w-fit">
        {FILTERS.map((f) => {
          const count = orders.filter(f.match).length;
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn('focus-ring relative flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-medium transition-colors', active ? 'text-fg' : 'text-muted hover:text-fg')}
            >
              {active && <motion.span layoutId="orders-filter" className="absolute inset-0 -z-10 rounded-xl bg-accent-soft" />}
              {f.label}
              <span className="rounded-md bg-line px-1.5 text-[11px] tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">No orders in this view.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((order, i) => (
            <motion.li key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
              <Link
                href={`/orders/${order.id}`}
                className="glass group flex items-center gap-3 rounded-2xl p-3 shadow-card transition-all hover:border-line-strong hover:shadow-float sm:gap-6 sm:p-4"
              >
                <div className="hidden -space-x-3 sm:flex">
                  {order.items.slice(0, 3).map((item) => (
                    <ProductArt key={item.productId} id={item.productId} name={item.productNameSnapshot} size="sm" className="h-11 w-11 rounded-lg ring-2 ring-white" />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-medium text-fg">#{shortId(order.id)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {order.items.length} {order.items.length === 1 ? 'item' : 'items'} · {relativeTime(order.createdAt)}
                  </p>
                  <div className="mt-2 sm:hidden">
                    <StatusBadge status={order.status} />
                  </div>
                </div>
                <div className="hidden sm:block">
                  <StatusBadge status={order.status} />
                </div>
                <span className="text-right font-semibold tabular-nums text-fg sm:w-24">{formatMoney(order.totalAmount, order.currency)}</span>
                <ChevronRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrdersHeader() {
  const { auth } = useAuth();
  const isAdmin = auth?.user.role === 'admin';
  return (
    <PageHeader
      title={isAdmin ? 'All orders' : 'Your orders'}
    />
  );
}

export default function OrdersPage() {
  return (
    <ProtectedRoute>
      <OrdersHeader />
      <OrdersList />
    </ProtectedRoute>
  );
}
