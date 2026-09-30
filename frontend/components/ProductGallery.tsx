'use client';

import { useState } from 'react';
import { cn } from '@/lib/format';
import type { ProductImage } from '@/lib/types';
import { ProductArt } from './ProductArt';

export function ProductGallery({ id, name, category, images }: { id: string; name: string; category: string; images: ProductImage[] }) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return <ProductArt id={id} name={name} category={category} size="lg" className="aspect-square rounded-2xl" />;
  }

  const current = images[Math.min(active, images.length - 1)];

  return (
    <div className="space-y-3">
      {/* Phones: swipeable strip of full-width photos. */}
      <div className="-mx-4 flex snap-x snap-mandatory overflow-x-auto sm:hidden" aria-label="Product photos">
        {images.map((image, index) => (
          <div key={image.id} className="w-full shrink-0 snap-center px-4">
            <ProductArt id={id} name={`${name} — photo ${index + 1}`} src={image.url} priority={index === 0} className="aspect-square rounded-xl" />
          </div>
        ))}
      </div>
      {images.length > 1 && <p className="text-center text-xs text-subtle sm:hidden">{images.length} photos · swipe to see more</p>}

      {/* Larger screens: main photo + thumbnails. */}
      <div className="hidden space-y-3 sm:block">
        <ProductArt id={id} name={name} src={current.url} priority className="aspect-square rounded-2xl border border-line" />
        {images.length > 1 && (
          <div className="grid grid-cols-5 gap-3">
            {images.map((image, index) => (
              <button
                key={image.id}
                onClick={() => setActive(index)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'focus-ring overflow-hidden rounded-lg border-2 transition-colors',
                  image.id === current.id ? 'border-accent' : 'border-transparent hover:border-line-strong',
                )}
                aria-label={`Show photo ${index + 1}`}
                aria-current={image.id === current.id}
              >
                <ProductArt id={id} name={`${name} — photo ${index + 1}`} src={image.url} className="aspect-square" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
