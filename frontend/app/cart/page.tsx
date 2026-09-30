'use client';

import { ArrowRight, ShoppingBag, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ProductArt } from '@/components/ProductArt';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { useCart } from '@/context/CartContext';
import { useCheckout } from '@/hooks/useCheckout';
import { formatMoney } from '@/lib/format';

export default function CartPage() {
  const { lines, updateQuantity, removeItem, clear, total, itemCount } = useCart();
  const { checkout, placing, error, canCheckout } = useCheckout();

  if (lines.length === 0) {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Browse the shop and add items to your cart."
          action={<ButtonLink href="/">Browse products</ButtonLink>}
        />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Shopping cart"
        description={`${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
        actions={
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear cart
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {lines.map((line) => (
              <motion.li
                key={line.productId}
                layout
                exit={{ opacity: 0, x: -40 }}
                className="glass flex gap-3 rounded-2xl p-3 shadow-card sm:items-center sm:gap-5 sm:p-4"
              >
                <Link href={`/products/${line.productId}`} className="shrink-0">
                  <ProductArt id={line.productId} name={line.name} src={line.imageUrl} size="sm" className="h-20 w-20 rounded-lg" />
                </Link>
                {/* Phones: name/price, then stepper + total + remove on one row. sm+: one row. */}
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${line.productId}`} className="line-clamp-2 text-sm font-medium text-fg hover:text-accent sm:text-base">
                      {line.name}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted">{formatMoney(line.price)} each</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:contents">
                    <QuantityStepper size="sm" value={line.quantity} onChange={(q) => updateQuantity(line.productId, q)} />
                    <p className="text-right font-semibold tabular-nums text-fg sm:w-24">{formatMoney(line.price * line.quantity)}</p>
                    <button
                      onClick={() => removeItem(line.productId)}
                      className="focus-ring rounded-lg p-2 text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <Card className="h-fit p-6 lg:sticky lg:top-24">
          <h2 className="text-base font-semibold text-fg">Order summary</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between text-muted">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(total)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Shipping</dt>
              <dd>Free</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold text-fg">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(total)}</dd>
            </div>
          </dl>

          <div className="mt-6">
            {canCheckout ? (
              <Button size="lg" className="w-full" loading={placing} onClick={() => void checkout()}>
                {placing ? 'Placing order…' : 'Place order'}
                {!placing && <ArrowRight className="h-4 w-4" />}
              </Button>
            ) : (
              <ButtonLink href="/login" size="lg" className="w-full">
                Log in to check out
              </ButtonLink>
            )}
            {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
          </div>

        </Card>
      </div>
    </div>
  );
}
