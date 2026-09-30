'use client';

import { ChevronDown, ChevronLeft, ChevronRight, PackageSearch, ServerCrash, SlidersHorizontal, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import * as api from '@/lib/api';
import type { ProductSort } from '@/lib/api';
import { cn, formatMoney } from '@/lib/format';
import type { Category, ProductSearchResult } from '@/lib/types';
import { priceFilterSchema, validate, type FieldErrors } from '@/lib/validation';

const PAGE_SIZE = 20;

const SORTS: { id: ProductSort; label: string }[] = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'price_asc', label: 'Lowest price' },
  { id: 'price_desc', label: 'Highest price' },
];

const PRICE_PRESETS = [
  { label: 'Under $50', min: undefined, max: 50 },
  { label: '$50 – $200', min: 50, max: 200 },
  { label: '$200 – $500', min: 200, max: 500 },
  { label: 'Over $500', min: 500, max: undefined },
];

type PriceRange = { min?: number; max?: number };

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <Shop />
    </Suspense>
  );
}

function Shop() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.get('q') ?? '';
  const categoryId = params.get('category');

  const [categories, setCategories] = useState<Category[]>([]);
  const [data, setData] = useState<ProductSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [price, setPrice] = useState<PriceRange>({});
  const [sort, setSort] = useState<ProductSort>('relevance');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Back to page 1 whenever the search itself changes.
  const searchKey = `${query}|${categoryId}`;
  const [lastSearchKey, setLastSearchKey] = useState(searchKey);
  if (lastSearchKey !== searchKey) {
    setLastSearchKey(searchKey);
    setPage(1);
  }

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Deferred a tick so state updates happen in a callback, not the effect body.
    const handle = setTimeout(() => {
      setLoading(true);
      setError(false);
      api
        .searchProducts({
          q: query || undefined,
          categoryId: categoryId ?? undefined,
          minPrice: price.min,
          maxPrice: price.max,
          sort,
          page,
          pageSize: PAGE_SIZE,
        })
        .then((res) => !cancelled && setData(res))
        .catch(() => !cancelled && setError(true))
        .finally(() => !cancelled && setLoading(false));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, categoryId, price.min, price.max, sort, page, reloadKey]);

  const results = data?.results ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeCategory = categories.find((c) => c.id === categoryId);
  const hasPrice = price.min !== undefined || price.max !== undefined;

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function applyPrice(range: PriceRange) {
    setPrice(range);
    setPage(1);
  }

  function changeSort(next: ProductSort) {
    setSort(next);
    setPage(1);
  }

  function clearAll() {
    applyPrice({});
    setSort('relevance');
    setParam('category', null);
  }

  const priceLabel =
    price.min !== undefined && price.max !== undefined
      ? `${formatMoney(price.min)} – ${formatMoney(price.max)}`
      : price.min !== undefined
        ? `Over ${formatMoney(price.min)}`
        : `Under ${formatMoney(price.max ?? 0)}`;

  const sidebar = (
    <aside className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-fg">Filter</h2>
        <button onClick={clearAll} className="text-sm font-medium text-fg hover:text-accent">
          Clear all
        </button>
      </div>

      {(activeCategory || hasPrice) && (
        <div className="flex flex-wrap gap-2">
          {activeCategory && <Chip onRemove={() => setParam('category', null)}>{activeCategory.name}</Chip>}
          {hasPrice && <Chip onRemove={() => applyPrice({})}>{priceLabel}</Chip>}
        </div>
      )}

      <FilterSection title="Category">
        <CategoryList categories={categories} selected={categoryId} onSelect={(id) => setParam('category', id)} />
      </FilterSection>

      <FilterSection title="Price">
        {/* Keyed on the applied range so presets / "Clear all" reset the inputs. */}
        <PriceFilter key={`${price.min}-${price.max}`} value={price} onApply={applyPrice} />
        <div className="mt-3 flex flex-wrap gap-2">
          {PRICE_PRESETS.map((preset) => {
            const active = price.min === preset.min && price.max === preset.max;
            return (
              <button
                key={preset.label}
                onClick={() => applyPrice(active ? {} : { min: preset.min, max: preset.max })}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel text-muted hover:border-line-strong',
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </FilterSection>
    </aside>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[230px_1fr] lg:gap-8">
      <div className="hidden lg:block">{sidebar}</div>

      <section className="-mx-4 min-w-0 bg-panel p-3 sm:mx-0 sm:rounded-2xl sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-5 sm:gap-3">
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            className="flex h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-fg sm:h-12 lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4 text-accent" />
            Filters
            {(activeCategory || hasPrice) && <span className="h-2 w-2 rounded-full bg-accent" />}
          </button>
          <div className="order-last w-full text-xs text-muted sm:order-none sm:w-auto sm:flex-1">
            {loading && !data ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              <>
                Showing {total.toLocaleString()} {total === 1 ? 'product' : 'products'}
                {query && (
                  <>
                    {' '}for <span className="font-semibold text-accent">“{query}”</span>
                  </>
                )}
                {activeCategory && <> in {activeCategory.name}</>}
              </>
            )}
          </div>
          <label className="relative ml-auto flex h-11 min-w-40 flex-col justify-center rounded-lg bg-white pl-4 pr-10 sm:h-12 sm:min-w-44">
            <span className="text-[11px] text-subtle">Sort by</span>
            <select
              value={sort}
              onChange={(e) => changeSort(e.target.value as ProductSort)}
              className="cursor-pointer appearance-none bg-transparent text-sm font-semibold text-fg outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
          </label>
        </div>

        {filtersOpen && <div className="mb-4 rounded-xl bg-white p-4 lg:hidden">{sidebar}</div>}

        {error ? (
          <div className="rounded-xl bg-white">
            <EmptyState
              tone="danger"
              icon={ServerCrash}
              title="Products couldn’t be loaded"
              description="Please try again in a moment."
              action={<Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>}
            />
          </div>
        ) : loading && !data ? (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl bg-white">
                <Skeleton className="aspect-square rounded-none" />
                <div className="space-y-2.5 p-3 sm:p-4">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-xl bg-white">
            <EmptyState
              icon={PackageSearch}
              title="No products found"
              description={query || activeCategory || hasPrice ? 'Try a different keyword or remove some filters.' : undefined}
              action={(activeCategory || hasPrice) && <Button onClick={clearAll}>Clear filters</Button>}
            />
          </div>
        ) : (
          <div className={cn('grid grid-cols-2 gap-2.5 pb-4 sm:gap-4 md:grid-cols-3 md:pb-14 xl:grid-cols-4', loading && 'opacity-60')}>
            {results.map((product) => (
              <ProductCard key={product.productId} product={product} />
            ))}
          </div>
        )}

        {totalPages > 1 && !error && (
          <Pagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            onChange={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </section>
    </div>
  );
}

function PriceFilter({ value, onApply }: { value: PriceRange; onApply: (range: PriceRange) => void }) {
  const [min, setMin] = useState(value.min?.toString() ?? '');
  const [max, setMax] = useState(value.max?.toString() ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = validate(priceFilterSchema, { min, max });
    if (result.errors) return setErrors(result.errors);
    setErrors({});
    onApply({ min: result.data.min, max: result.data.max });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <div className="flex items-center gap-2">
        <PriceInput
          placeholder="Min"
          value={min}
          invalid={!!errors.min}
          onChange={(v) => {
            setMin(v);
            setErrors({});
          }}
        />
        <span className="text-subtle">–</span>
        <PriceInput
          placeholder="Max"
          value={max}
          invalid={!!errors.max}
          onChange={(v) => {
            setMax(v);
            setErrors({});
          }}
        />
      </div>
      {(errors.min || errors.max) && <p className="text-xs text-danger">{errors.min ?? errors.max}</p>}
      <button type="submit" className="h-9 w-full rounded-lg border border-accent text-sm font-semibold text-accent hover:bg-accent-soft">
        Apply
      </button>
    </form>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between py-1" aria-expanded={open}>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function CategoryList({ categories, selected, onSelect }: { categories: Category[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const [showAll, setShowAll] = useState(false);
  if (categories.length === 0) return <p className="text-sm text-subtle">No categories yet.</p>;
  const shown = showAll ? categories : categories.slice(0, 7);
  return (
    <div className="space-y-3">
      {shown.map((c) => (
        <label key={c.id} className="flex cursor-pointer items-center gap-3 text-sm text-fg">
          {/* One category at a time — the search API takes a single categoryId. */}
          <input type="checkbox" className="check" checked={selected === c.id} onChange={() => onSelect(selected === c.id ? null : c.id)} />
          <span className={selected === c.id ? 'font-medium' : 'text-muted'}>{c.name}</span>
        </label>
      ))}
      {categories.length > 7 && (
        <button onClick={() => setShowAll((s) => !s)} className="text-xs font-semibold text-fg hover:text-accent">
          {showAll ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}

function PriceInput({ placeholder, value, invalid, onChange }: { placeholder: string; value: string; invalid: boolean; onChange: (v: string) => void }) {
  return (
    <div className="relative flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-subtle">$</span>
      <input
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className={cn('h-10 w-full rounded-lg border bg-white pl-6 pr-2 text-sm outline-none focus:border-accent', invalid ? 'border-danger' : 'border-line')}
        aria-label={`${placeholder} price`}
      />
    </div>
  );
}

function Chip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-panel py-1.5 pl-3.5 pr-2.5 text-sm text-fg">
      {children}
      <button onClick={onRemove} className="text-accent hover:text-accent-hover" aria-label="Remove filter">
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </span>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  // Always show first, last, and the pages around the current one.
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1);
  const btn = 'flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors';
  return (
    <nav className="mt-2 flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button className={cn(btn, 'bg-white text-muted hover:text-fg disabled:opacity-40')} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-subtle">…</span>}
          <button
            onClick={() => onChange(p)}
            className={cn(btn, p === page ? 'bg-accent text-white' : 'bg-white text-fg hover:text-accent')}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        </span>
      ))}
      <button className={cn(btn, 'bg-white text-muted hover:text-fg disabled:opacity-40')} disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
