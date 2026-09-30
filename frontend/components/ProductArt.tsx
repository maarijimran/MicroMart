import {
  Armchair,
  BookOpen,
  Camera,
  Gamepad2,
  Headphones,
  Keyboard,
  Laptop,
  Monitor,
  Mouse,
  Package,
  Shirt,
  Smartphone,
  Watch,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';
import { cn } from '@/lib/format';

// Fallback for products without photos: a neutral tile with an icon picked
// from the product's name/category.
const ICONS: [RegExp, LucideIcon][] = [
  [/head(phone|set)|earbud|audio|speaker|mic/i, Headphones],
  [/keyboard|keypad/i, Keyboard],
  [/mouse/i, Mouse],
  [/monitor|display|screen|tv/i, Monitor],
  [/laptop|notebook|computer/i, Laptop],
  [/phone|mobile|tablet/i, Smartphone],
  [/camera|lens/i, Camera],
  [/game|console|controller/i, Gamepad2],
  [/watch/i, Watch],
  [/shirt|cloth|apparel|fashion|wear/i, Shirt],
  [/book/i, BookOpen],
  [/chair|desk|furniture|home/i, Armchair],
];

export function productIcon(text: string): LucideIcon {
  return ICONS.find(([pattern]) => pattern.test(text))?.[1] ?? Package;
}

interface ProductArtProps {
  id: string;
  name: string;
  category?: string;
  /** Product photo. When absent, a neutral icon tile is shown instead. */
  src?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Above-the-fold images (e.g. the product page hero) load eagerly. */
  priority?: boolean;
}

export function ProductArt({ name, category = '', src, className, size = 'md', priority = false }: ProductArtProps) {
  if (src) {
    return (
      <div className={cn('overflow-hidden bg-[#f4f4f4]', className)}>
        {/* Plain <img>: photos are served straight from object storage / a CDN,
            which already sets long-lived cache headers. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  // createElement rather than <Icon />: the icon is one of the stable
  // module-level components above, picked per product.
  const icon = createElement(productIcon(`${name} ${category}`), {
    className: cn(
      'drop-shadow-[0_10px_12px_rgb(0_0_0/0.18)]',
      size === 'sm' ? 'h-1/2 w-1/2' : size === 'lg' ? 'h-2/5 w-2/5' : 'h-[42%] w-[42%]',
    ),
    strokeWidth: size === 'sm' ? 1.75 : 1.25,
  });
  return (
    <div
      className={cn('flex items-center justify-center bg-gradient-to-b from-[#f4f4f4] to-[#e9e9e9] text-[#3a3a3a]', className)}
      aria-hidden
    >
      {icon}
    </div>
  );
}
