'use client';

import { ShoppingCart, Tag } from 'lucide-react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/context/ToastContext';
import { formatMoney } from '@/lib/format';
import type { ProductSearchHit } from '@/lib/types';
import { ProductArt } from './ProductArt';

export function ProductCard({ product }: { product: ProductSearchHit }) {
  const { addItem } = useCart();
  const toast = useToast();

  function handleAdd() {
    addItem({ productId: product.productId, name: product.name, price: product.price, imageUrl: product.imageUrl });
    toast({ tone: 'success', title: 'Added to cart', description: product.name, action: { label: 'View cart', href: '/cart' } });
  }

  return (
    // On hover the card lifts and an "Add to cart" panel drops below it,
    // overlapping the next row. Touch screens get
    // an always-visible button instead.
    <article className="group relative h-full focus-within:z-10 hover:z-10">
      <div className="flex h-full flex-col overflow-hidden rounded-xl bg-white transition-shadow duration-200 md:group-focus-within:rounded-b-none md:group-focus-within:shadow-float md:group-hover:rounded-b-none md:group-hover:shadow-float">
        <Link href={`/products/${product.productId}`} className="focus-ring block">
          <ProductArt id={product.productId} name={product.name} category={product.categoryName} src={product.imageUrl} className="aspect-square" />
        </Link>
        <div className="flex flex-1 flex-col p-3 sm:p-4">
          <Link
            href={`/products/${product.productId}`}
            className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-5 text-fg hover:text-accent"
          >
            {product.name}
          </Link>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Tag className="h-3.5 w-3.5 text-subtle" />
            {product.categoryName}
          </p>
          <p className="mt-auto pt-3 text-sm font-bold text-accent sm:text-base">{formatMoney(product.price)}</p>
          <button
            onClick={handleAdd}
            className="focus-ring mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-semibold text-white hover:bg-accent-hover sm:h-10 sm:text-sm md:hidden"
          >
            <ShoppingCart className="h-4 w-4" />
            Add to cart
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-full hidden rounded-b-xl bg-white px-4 pb-4 opacity-0 shadow-float transition-opacity duration-150 [clip-path:inset(0_-40px_-40px_-40px)] group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 md:block">
        <button
          onClick={handleAdd}
          className="focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover"
        >
          <ShoppingCart className="h-4 w-4" />
          Add to cart
        </button>
      </div>
    </article>
  );
}
