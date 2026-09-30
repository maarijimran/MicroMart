'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';

/** POST /orders, then follow the saga on the order page. */
export function useCheckout() {
  const { auth } = useAuth();
  const { lines, clear } = useCart();
  const toast = useToast();
  const router = useRouter();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    if (!auth || lines.length === 0) return;
    setPlacing(true);
    setError(null);
    try {
      const order = await api.checkout(
        auth.accessToken,
        lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      );
      clear();
      toast({ tone: 'success', title: 'Order placed' });
      router.push(`/orders/${order.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed.';
      setError(message);
      toast({ tone: 'error', title: 'Checkout failed', description: message });
    } finally {
      setPlacing(false);
    }
  }

  return { checkout, placing, error, canCheckout: !!auth };
}
