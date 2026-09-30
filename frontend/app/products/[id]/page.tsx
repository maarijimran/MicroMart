'use client';

import { ChevronRight, PackageX, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProductGallery } from '@/components/ProductGallery';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Product } from '@/lib/types';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState(false);
  const { addItem } = useCart();
  const toast = useToast();

  useEffect(() => {
    api
      .getProduct(params.id)
      .then(setProduct)
      .catch(() => setError(true));
  }, [params.id]);

  if (error) {
    return (
      <EmptyState
        icon={PackageX}
        title="Product not found"
        description="This product may have been removed."
        action={<ButtonLink href="/">Back to shop</ButtonLink>}
      />
    );
  }

  if (!product) {
    return (
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        <Skeleton className="aspect-square rounded-2xl" />
        <div className="space-y-4 pt-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    );
  }

  const inStock = product.quantityAvailable > 0;
  const lowStock = inStock && product.quantityAvailable <= 5;

  function add(buyNow: boolean) {
    if (!product) return;
    addItem({ productId: product.id, name: product.name, price: product.price, imageUrl: product.images[0]?.url ?? null }, quantity);
    if (buyNow) {
      router.push('/cart');
    } else {
      toast({ tone: 'success', title: 'Added to cart', description: `${quantity} × ${product.name}`, action: { label: 'View cart', href: '/cart' } });
    }
  }

  return (
    <div>
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-accent">Home</Link>
        <ChevronRight className="h-3.5 w-3.5 text-subtle" />
        <Link href={`/?category=${product.category.id}`} className="hover:text-accent">{product.category.name}</Link>
        <ChevronRight className="h-3.5 w-3.5 text-subtle" />
        <span className="truncate text-fg">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
        <ProductGallery id={product.id} name={product.name} category={product.category.name} images={product.images} />

        <div>
          <h1 className="text-2xl font-bold leading-tight text-fg sm:text-[28px]">{product.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <Link href={`/?category=${product.category.id}`} className="font-medium text-accent hover:underline">
              {product.category.name}
            </Link>
            <span className="h-3.5 w-px bg-line-strong" />
            <span>SKU {product.sku}</span>
          </div>

          <div className="mt-6 rounded-xl bg-panel px-5 py-4">
            <p className="text-3xl font-bold text-accent">{formatMoney(product.price, product.currency)}</p>
          </div>

          <dl className="mt-6 space-y-4 text-sm">
            <div className="flex gap-4">
              <dt className="w-24 shrink-0 text-muted">Availability</dt>
              <dd className={inStock ? (lowStock ? 'font-medium text-warning' : 'font-medium text-success') : 'font-medium text-danger'}>
                {inStock ? (lowStock ? `Only ${product.quantityAvailable} left` : `${product.quantityAvailable} in stock`) : 'Out of stock'}
              </dd>
            </div>
            <div className="flex items-center gap-4">
              <dt className="w-24 shrink-0 text-muted">Quantity</dt>
              <dd>
                <QuantityStepper value={quantity} onChange={setQuantity} max={Math.max(product.quantityAvailable, 1)} />
              </dd>
            </div>
          </dl>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:flex">
            <Button size="lg" variant="secondary" disabled={!inStock} onClick={() => add(false)} className="sm:px-8">
              <ShoppingCart className="h-4 w-4" />
              Add to cart
            </Button>
            <Button size="lg" disabled={!inStock} onClick={() => add(true)} className="sm:px-10">
              Buy now
            </Button>
          </div>

          {product.description && (
            <div className="mt-10 border-t border-line pt-6">
              <h2 className="text-sm font-bold text-fg">Description</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted">{product.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
