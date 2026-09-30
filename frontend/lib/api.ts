import type {
  AuthResponse,
  Category,
  ListOrdersResponse,
  Order,
  Payment,
  Product,
  ProductSearchResult,
  Wallet,
} from './types';

export class ApiError extends Error {
  status: number;
  errors?: unknown;

  constructor(status: number, message: string, errors?: unknown) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<T> {
  // FormData (file uploads) sets its own multipart Content-Type with a boundary.
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
  });

  const text = await response.text();
  let data: { message?: string; errors?: unknown } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error page (e.g. from a proxy) — fall back to the status text below.
  }

  if (!response.ok) {
    throw new ApiError(response.status, data?.message ?? response.statusText, data?.errors);
  }
  return data as T;
}

// --- Auth (proxied straight through to Auth's own REST API) ---

export const register = (email: string, password: string, firstName?: string) =>
  request<{ id: string; email: string }>('POST', '/auth/register', { body: { email, password, firstName } });

export const login = (email: string, password: string) =>
  request<AuthResponse>('POST', '/auth/login', { body: { email, password } });

export const logout = (refreshToken: string) =>
  request<void>('POST', '/auth/logout', { body: { refreshToken } });

// --- Catalog ---

export const listCategories = () => request<Category[]>('GET', '/categories');

export const createCategory = (token: string, name: string, slug: string) =>
  request<Category>('POST', '/categories', { token, body: { name, slug } });

export type ProductSort = 'relevance' | 'price_asc' | 'price_desc';

export const searchProducts = (
  params: { q?: string; categoryId?: string; minPrice?: number; maxPrice?: number; sort?: ProductSort; page?: number; pageSize?: number } = {},
) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.minPrice !== undefined) qs.set('minPrice', String(params.minPrice));
  if (params.maxPrice !== undefined) qs.set('maxPrice', String(params.maxPrice));
  if (params.sort && params.sort !== 'relevance') qs.set('sort', params.sort);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const suffix = qs.toString();
  return request<ProductSearchResult>('GET', `/products${suffix ? `?${suffix}` : ''}`);
};

export const getProduct = (id: string) => request<Product>('GET', `/products/${id}`);

/** multipart/form-data: the product fields plus 1–5 `images` files. */
export const createProduct = (token: string, form: FormData) => request<Product>('POST', '/products', { token, body: form });

export const setStock = (token: string, productId: string, quantityAvailable: number) =>
  request<Product>('POST', `/products/${productId}/stock`, { token, body: { quantityAvailable } });

// --- Orders (the REST -> gRPC checkout path) ---

export const checkout = (token: string, items: { productId: string; quantity: number }[]) =>
  request<Order>('POST', '/orders', { token, body: { items } });

export const listOrders = (token: string) => request<ListOrdersResponse>('GET', '/orders', { token });

export const getOrder = (token: string, id: string) => request<Order>('GET', `/orders/${id}`, { token });

// --- Payment / Wallet ---

export const getMyWallet = (token: string) => request<Wallet>('GET', '/wallets/me', { token });

export const seedWallet = (token: string, userId: string, balance: number, currency = 'USD') =>
  request<Wallet>('POST', `/wallets/${userId}/seed`, { token, body: { balance, currency } });

export const getPaymentByOrder = (token: string, orderId: string) =>
  request<Payment>('GET', `/payments/order/${orderId}`);
