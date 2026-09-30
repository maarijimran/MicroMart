'use client';

import { ArrowLeft, CreditCard, PackageX } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProductArt } from '@/components/ProductArt';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SagaTimeline } from '@/components/SagaTimeline';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, Skeleton } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import * as api from '@/lib/api';
import { formatMoney, shortId } from '@/lib/format';
import type { Order, Payment } from '@/lib/types';

const IN_FLIGHT: Order['status'][] = ['pending', 'awaiting_payment'];

function OrderDetail({ orderId }: { orderId: string }) {
  const { auth } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      let result: Order;
      try {
        result = await api.getOrder(auth!.accessToken, orderId);
      } catch {
        if (!cancelled) setError(true);
        return;
      }
      if (cancelled) return;
      setOrder(result);

      // Payment only exists once Catalog has reserved stock and Payment has
      // reacted to it — 404 just means "hasn't happened yet", not an error.
      api
        .getPaymentByOrder(auth!.accessToken, orderId)
        .then((p) => !cancelled && setPayment(p.found ? p : null))
        .catch(() => {});

      // Stop polling once the saga has finished — the order won't change again.
      if (IN_FLIGHT.includes(result.status)) {
        timer = setTimeout(poll, 2000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auth, orderId]);

  if (error) {
    return (
      <EmptyState
        icon={PackageX}
        title="Order not found"
        description="We couldn’t find this order."
        action={<ButtonLink href="/orders" variant="secondary">Back to orders</ButtonLink>}
      />
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const live = IN_FLIGHT.includes(order.status);

  return (
    <div>
      <Link href="/orders" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        All orders
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mb-8">
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-fg sm:text-3xl">#{shortId(order.id)}</h1>
        <StatusBadge status={order.status} />
        <span className="w-full text-sm text-subtle sm:w-auto">
          {new Date(order.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <Card className="p-5 sm:p-8">
          <h2 className="mb-6 text-base font-semibold text-fg">Order status</h2>
          <SagaTimeline order={order} payment={payment} />
        </Card>

        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-semibold text-fg">Items</h2>
            <ul className="mt-4 space-y-4">
              {order.items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3">
                  <ProductArt id={item.productId} name={item.productNameSnapshot} size="sm" className="h-12 w-12 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{item.productNameSnapshot}</p>
                    <p className="text-xs text-muted">
                      {item.quantity} × {formatMoney(item.unitPriceSnapshot, order.currency)}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-fg">{formatMoney(item.subtotal, order.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-sm text-muted">Total</span>
              <span className="text-xl font-semibold tabular-nums text-fg">{formatMoney(order.totalAmount, order.currency)}</span>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-accent" />
              <h2 className="text-base font-semibold text-fg">Payment</h2>
            </div>
            {payment ? (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Status</span>
                  <Badge tone={payment.status === 'succeeded' ? 'success' : 'danger'} className="capitalize">
                    {payment.status}
                  </Badge>
                </div>
                {payment.amount !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Amount</span>
                    <span className="tabular-nums text-fg">{formatMoney(payment.amount, payment.currency)}</span>
                  </div>
                )}
                {payment.failureReason && (
                  <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">Reason: {payment.failureReason.replaceAll('_', ' ')}</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">
                {live ? 'Pending' : 'No payment was taken for this order.'}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <ProtectedRoute>
      <OrderDetail orderId={params.id} />
    </ProtectedRoute>
  );
}
