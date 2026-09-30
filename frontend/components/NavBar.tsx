'use client';

import { ChevronDown, Search, ShoppingBag, ShoppingCart, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import * as api from '@/lib/api';
import { cn } from '@/lib/format';
import type { Category } from '@/lib/types';
import { searchSchema, validate } from '@/lib/validation';
import { UserMenu } from './UserMenu';
import { ButtonLink } from './ui/Button';

const AUTH_PAGES = ['/login', '/register'];

function Logo() {
  return (
    <Link href="/" className="focus-ring flex shrink-0 items-center gap-2 rounded-lg">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
        <ShoppingBag className="h-5 w-5" strokeWidth={2.25} />
      </span>
      <span className="text-xl font-bold tracking-tight text-accent sm:text-2xl">MicroMart</span>
    </Link>
  );
}

export function NavBar() {
  const { auth, loading } = useAuth();
  const { itemCount } = useCart();
  const pathname = usePathname();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // Sign-in pages get a plain header: just the logo, no search or account controls.
  if (AUTH_PAGES.includes(pathname)) {
    return (
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      {/* Phones: logo + actions on the first row, full-width search below.
          md+: logo | search | actions on one row. */}
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 md:flex-nowrap md:items-start md:gap-8 md:pt-4">
        <div className="md:mt-1">
          <Logo />
        </div>

        <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">
          {/* useSearchParams needs a Suspense boundary under the App Router. */}
          <Suspense fallback={<div className="h-11 rounded-lg bg-panel" />}>
            <HeaderSearch categories={categories} />
          </Suspense>
          {categories.length > 0 && (
            <nav className="mt-2 hidden flex-wrap items-center text-xs text-muted md:flex" aria-label="Popular categories">
              {categories.slice(0, 8).map((c, i) => (
                <span key={c.id} className="flex items-center">
                  {i > 0 && <span className="mx-2.5 h-3 w-px bg-line-strong" />}
                  <Link href={`/?category=${c.id}`} className="hover:text-accent">
                    {c.name}
                  </Link>
                </span>
              ))}
            </nav>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:ml-0">
          <Link
            href="/cart"
            className="focus-ring relative flex h-10 w-10 items-center justify-center rounded-lg text-fg hover:bg-panel sm:h-11 sm:w-11"
            aria-label={`Cart, ${itemCount} items`}
          >
            <ShoppingCart className="h-5 w-5" />
            {itemCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </Link>

          {loading ? (
            <div className="skeleton h-10 w-24 rounded-lg sm:h-11 sm:w-40" />
          ) : auth ? (
            <UserMenu />
          ) : (
            <div className="flex items-center gap-2">
              <ButtonLink href="/login" variant="secondary" size="sm" className="h-9 sm:h-10 sm:px-4 sm:text-sm">
                Log in
              </ButtonLink>
              {/* Phones: "Log in" only — the login page links to sign-up. */}
              <span className="hidden sm:inline-flex">
                <ButtonLink href="/register" size="sm" className="sm:h-10 sm:px-4 sm:text-sm">
                  Sign up
                </ButtonLink>
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderSearch({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const urlCategory = params.get('category') ?? '';
  const [query, setQuery] = useState(urlQuery);
  const [category, setCategory] = useState(urlCategory);

  // Keep the inputs in sync when the URL changes elsewhere (sidebar filters,
  // category links) — the "adjust state during render" pattern, no effect needed.
  const [synced, setSynced] = useState({ urlQuery, urlCategory });
  if (synced.urlQuery !== urlQuery || synced.urlCategory !== urlCategory) {
    setSynced({ urlQuery, urlCategory });
    setQuery(urlQuery);
    setCategory(urlCategory);
  }

  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = validate(searchSchema, { q: query });
    if (result.errors) return setError(result.errors.q ?? null);
    setError(null);
    const next = new URLSearchParams();
    if (result.data.q) next.set('q', result.data.q);
    if (category) next.set('category', category);
    const qs = next.toString();
    router.push(qs ? `/?${qs}` : '/');
  }

  return (
    <div>
      <form
        onSubmit={submit}
        noValidate
        role="search"
        className={cn(
          'flex h-11 items-center rounded-lg bg-panel pl-1 pr-1 focus-within:ring-2',
          error ? 'ring-2 ring-danger/40' : 'ring-accent/30',
        )}
      >
        <div className="relative hidden h-full items-center sm:flex">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            className="h-full max-w-40 cursor-pointer appearance-none rounded-md bg-transparent pl-3 pr-8 text-xs font-semibold uppercase tracking-wide text-fg outline-none"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted" />
          <span className="mx-1 h-5 w-px bg-line-strong" />
        </div>
        <Search className="ml-2 h-4 w-4 shrink-0 text-subtle sm:hidden" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          placeholder="Search products…"
          aria-label="Search products"
          aria-invalid={!!error}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-fg outline-none placeholder:text-subtle"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setError(null);
            }}
            className="mr-2 text-accent hover:text-accent-hover"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button type="submit" className="focus-ring h-9 shrink-0 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover sm:px-5">
          Search
        </button>
      </form>
      {error && <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
