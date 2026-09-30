'use client';

import { Boxes, PackagePlus, Search, WalletMinimal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { FormError } from '@/components/AuthShell';
import { ImagePicker } from '@/components/ImagePicker';
import { PageHeader } from '@/components/PageHeader';
import { ProductArt } from '@/components/ProductArt';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Skeleton } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Field';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { cn, formatMoney, slugify } from '@/lib/format';
import type { Category, Product, ProductSearchHit } from '@/lib/types';
import {
  categorySchema,
  findNonImage,
  productSchema,
  readApiError,
  seedWalletSchema,
  stockSchema,
  validate,
  type FieldErrors,
} from '@/lib/validation';

type Tab = 'catalog' | 'inventory' | 'wallets';

const TABS: { id: Tab; label: string; icon: typeof Boxes }[] = [
  { id: 'catalog', label: 'Catalog', icon: PackagePlus },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'wallets', label: 'Wallets', icon: WalletMinimal },
];

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-4 sm:p-6', className)}>
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

/** Small form-state helper: values, per-field errors (cleared on edit), and a form-level error. */
function useFormState<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof T>(field: K, value: T[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field as string]: undefined }));
  };
  const reset = (next: Partial<T> = {}) => {
    setValues({ ...initial, ...next });
    setErrors({});
    setFormError(null);
  };
  return { values, set, errors, setErrors, formError, setFormError, reset };
}

// ---------------- Catalog ----------------

function CategoryPanel({ token, categories, onCreated }: { token: string; categories: Category[]; onCreated: () => void }) {
  const toast = useToast();
  const form = useFormState({ name: '', slug: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    form.setFormError(null);
    const result = validate(categorySchema, form.values);
    if (result.errors) return form.setErrors(result.errors);
    setSaving(true);
    try {
      const category = await api.createCategory(token, result.data.name, result.data.slug);
      toast({ tone: 'success', title: `Category “${category.name}” created` });
      form.reset();
      setSlugTouched(false);
      onCreated();
    } catch (err) {
      const { fields, message } = readApiError(err, 'Could not create the category.');
      form.setErrors(fields);
      form.setFormError(Object.keys(fields).length ? null : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="New category">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          label="Name"
          placeholder="Headphones"
          value={form.values.name}
          error={form.errors.name}
          onChange={(e) => {
            form.set('name', e.target.value);
            if (!slugTouched) form.set('slug', slugify(e.target.value));
          }}
        />
        <Field
          label="Slug"
          placeholder="headphones"
          value={form.values.slug}
          error={form.errors.slug}
          onChange={(e) => {
            form.set('slug', e.target.value);
            setSlugTouched(true);
          }}
        />
        <FormError message={form.formError} />
        <Button type="submit" loading={saving} className="w-full">
          Create category
        </Button>
      </form>
      {categories.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <p className="mb-3 text-xs font-medium text-muted">Categories ({categories.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <Badge key={c.id}>{c.name}</Badge>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

const EMPTY_PRODUCT = {
  categoryId: '',
  name: '',
  sku: '',
  slug: '',
  description: '',
  price: '',
  initialQuantity: '',
  images: [] as File[],
};

function ProductPanel({ token, categories }: { token: string; categories: Category[] }) {
  const toast = useToast();
  const form = useFormState(EMPTY_PRODUCT);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const { values, errors } = form;

  async function setImages(images: File[]) {
    form.set('images', images);
    // Check photos as soon as they're picked, not only on submit.
    const check = productSchema.shape.images.safeParse(images);
    const message = check.success || images.length === 0 ? (await findNonImage(images)) ?? undefined : check.error.issues[0]?.message;
    form.setErrors((e) => ({ ...e, images: message }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    form.setFormError(null);
    const result = validate(productSchema, values);
    const nonImage = await findNonImage(values.images);
    if (result.errors || nonImage) {
      return form.setErrors({ ...(result.errors ?? {}), ...(nonImage && !result.errors?.images ? { images: nonImage } : {}) });
    }

    const data = result.data;
    const body = new FormData();
    body.append('categoryId', data.categoryId);
    body.append('name', data.name);
    body.append('sku', data.sku);
    body.append('slug', data.slug);
    body.append('description', data.description);
    body.append('price', String(data.price));
    body.append('initialQuantity', String(data.initialQuantity));
    for (const image of data.images) body.append('images', image, image.name);

    setSaving(true);
    try {
      const product = await api.createProduct(token, body);
      toast({ tone: 'success', title: `“${product.name}” created`, action: { label: 'View product', href: `/products/${product.id}` } });
      form.reset({ categoryId: data.categoryId });
      setSlugTouched(false);
    } catch (err) {
      const { fields, message } = readApiError(err, 'Could not create the product.');
      form.setErrors(fields);
      form.setFormError(Object.keys(fields).length ? null : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="New product">
      <form onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ImagePicker files={values.images} onChange={setImages} error={errors.images} />
        </div>
        <Select
          label="Category"
          value={values.categoryId}
          onChange={(e) => form.set('categoryId', e.target.value)}
          className="sm:col-span-2"
          hint={errors.categoryId ? <span className="text-danger">{errors.categoryId}</span> : undefined}
        >
          <option value="">{categories.length === 0 ? 'Create a category first' : 'Choose a category'}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Field
          label="Name"
          placeholder="Studio Headphones"
          value={values.name}
          error={errors.name}
          onChange={(e) => {
            form.set('name', e.target.value);
            if (!slugTouched) form.set('slug', slugify(e.target.value));
          }}
        />
        <Field label="SKU" placeholder="HP-STUDIO-01" value={values.sku} error={errors.sku} onChange={(e) => form.set('sku', e.target.value.toUpperCase())} />
        <Field
          label="Slug"
          placeholder="studio-headphones"
          value={values.slug}
          error={errors.slug}
          onChange={(e) => {
            form.set('slug', e.target.value);
            setSlugTouched(true);
          }}
          className="sm:col-span-2"
        />
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="product-description" className="block text-xs font-medium text-muted">
            Description (optional)
          </label>
          <textarea
            id="product-description"
            rows={4}
            value={values.description}
            onChange={(e) => form.set('description', e.target.value)}
            aria-invalid={!!errors.description}
            className={cn(
              'w-full resize-y rounded-lg border bg-white px-3.5 py-3 text-sm text-fg outline-none transition-all placeholder:text-subtle hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent-soft',
              errors.description ? 'border-danger' : 'border-line',
            )}
          />
          {errors.description && <p className="text-xs text-danger">{errors.description}</p>}
        </div>
        <Field
          label="Price (USD)"
          inputMode="decimal"
          placeholder="199.00"
          value={values.price}
          error={errors.price}
          onChange={(e) => form.set('price', e.target.value)}
        />
        <Field
          label="Stock"
          inputMode="numeric"
          placeholder="10"
          value={values.initialQuantity}
          error={errors.initialQuantity}
          onChange={(e) => form.set('initialQuantity', e.target.value)}
        />
        <div className="sm:col-span-2">
          <FormError message={form.formError} />
        </div>
        <Button type="submit" size="lg" loading={saving} className="sm:col-span-2">
          {saving ? 'Uploading…' : 'Create product'}
        </Button>
      </form>
    </Panel>
  );
}

// ---------------- Inventory ----------------

function InventoryPanel({ token }: { token: string }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProductSearchHit[] | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const form = useFormState({ quantity: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      api
        .searchProducts({ q: query.trim() || undefined, pageSize: 50 })
        .then((res) => setHits(res.results))
        .catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  async function select(productId: string) {
    try {
      const product = await api.getProduct(productId);
      setSelected(product);
      form.reset({ quantity: String(product.quantityAvailable) });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not load the product', description: readApiError(err).message });
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    form.setFormError(null);
    const result = validate(stockSchema, form.values);
    if (result.errors) return form.setErrors(result.errors);
    setSaving(true);
    try {
      const updated = await api.setStock(token, selected.id, result.data.quantity);
      setSelected(updated);
      toast({ tone: 'success', title: 'Stock updated', description: `${updated.name}: ${updated.quantityAvailable} available` });
    } catch (err) {
      const { fields, message } = readApiError(err, 'Could not update stock.');
      form.setErrors({ quantity: fields.quantityAvailable });
      form.setFormError(fields.quantityAvailable ? null : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Panel title="Products">
        <Field icon={Search} placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="mt-4 max-h-[28rem] space-y-1 overflow-y-auto pr-1">
          {!hits && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          {hits?.length === 0 && <p className="py-8 text-center text-sm text-muted">No products found.</p>}
          {hits?.map((hit) => (
            <li key={hit.productId}>
              <button
                onClick={() => void select(hit.productId)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
                  selected?.id === hit.productId ? 'bg-accent-soft' : 'hover:bg-panel',
                )}
              >
                <ProductArt id={hit.productId} name={hit.name} category={hit.categoryName} src={hit.imageUrl} size="sm" className="h-11 w-11 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{hit.name}</p>
                  <p className="text-xs text-muted">{hit.categoryName}</p>
                </div>
                <span className="text-sm tabular-nums text-muted">{formatMoney(hit.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Stock" className="h-fit lg:sticky lg:top-28">
        {selected ? (
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div className="flex items-center gap-3">
              <ProductArt
                id={selected.id}
                name={selected.name}
                category={selected.category.name}
                src={selected.images[0]?.url}
                size="sm"
                className="h-12 w-12 shrink-0 rounded-lg"
              />
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{selected.name}</p>
                <p className="text-xs text-subtle">SKU {selected.sku}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs text-muted">Available</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{selected.quantityAvailable}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs text-muted">Reserved</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{selected.quantityReserved}</p>
              </div>
            </div>
            <Field
              label="Available quantity"
              inputMode="numeric"
              value={form.values.quantity}
              error={form.errors.quantity}
              onChange={(e) => form.set('quantity', e.target.value)}
            />
            <FormError message={form.formError} />
            <Button type="submit" loading={saving} className="w-full">
              Update stock
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted">Select a product.</p>
        )}
      </Panel>
    </div>
  );
}

// ---------------- Wallets ----------------

function WalletPanel({ token }: { token: string }) {
  const toast = useToast();
  const form = useFormState({ userId: '', balance: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    form.setFormError(null);
    const result = validate(seedWalletSchema, form.values);
    if (result.errors) return form.setErrors(result.errors);
    setSaving(true);
    try {
      const wallet = await api.seedWallet(token, result.data.userId, result.data.balance);
      toast({ tone: 'success', title: 'Wallet updated', description: `Balance: ${formatMoney(wallet.balance, wallet.currency)}` });
      form.reset({ userId: result.data.userId });
    } catch (err) {
      const { fields, message } = readApiError(err, 'Could not update the wallet.');
      form.setErrors(fields);
      form.setFormError(Object.keys(fields).length ? null : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Set wallet balance" className="max-w-xl">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          label="Account ID"
          placeholder="00000000-0000-0000-0000-000000000000"
          value={form.values.userId}
          error={form.errors.userId}
          onChange={(e) => form.set('userId', e.target.value)}
        />
        <Field
          label="Balance (USD)"
          inputMode="decimal"
          placeholder="500.00"
          value={form.values.balance}
          error={form.errors.balance}
          onChange={(e) => form.set('balance', e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {[100, 500, 1000, 5000].map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => form.set('balance', String(amount))}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {formatMoney(amount)}
            </button>
          ))}
        </div>
        <FormError message={form.formError} />
        <Button type="submit" loading={saving} className="w-full">
          Save balance
        </Button>
      </form>
    </Panel>
  );
}

// ---------------- Shell ----------------

function AdminConsole() {
  const { auth } = useAuth();
  const [tab, setTab] = useState<Tab>('catalog');
  const [categories, setCategories] = useState<Category[]>([]);

  const loadCategories = useCallback(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(loadCategories, [loadCategories]);

  if (!auth) return null;
  const token = auth.accessToken;

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_1fr] lg:gap-8">
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0" aria-label="Admin sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'focus-ring flex shrink-0 items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-colors',
              tab === id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-panel hover:text-fg',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="min-w-0">
          {tab === 'catalog' && (
            <div className="grid gap-6 xl:grid-cols-[20rem_1fr]">
              <CategoryPanel token={token} categories={categories} onCreated={loadCategories} />
              <ProductPanel token={token} categories={categories} />
            </div>
          )}
          {tab === 'inventory' && <InventoryPanel token={token} />}
          {tab === 'wallets' && <WalletPanel token={token} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function AdminPage() {
  return (
    <ProtectedRoute requireAdmin>
      <PageHeader title="Admin" />
      <AdminConsole />
    </ProtectedRoute>
  );
}
