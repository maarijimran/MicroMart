export type Role = 'customer' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  isActive: boolean;
  category: { id: string; name: string; slug: string };
  quantityAvailable: number;
  quantityReserved: number;
  images: ProductImage[];
}

export interface ProductImage {
  id: string;
  url: string;
  position: number;
}

export interface ProductSearchHit {
  productId: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  price: number;
  isActive: boolean;
  /** First product photo, or null for products created before photos were required. */
  imageUrl: string | null;
}

export interface ProductSearchResult {
  total: number;
  page: number;
  pageSize: number;
  results: ProductSearchHit[];
}

export type OrderStatus = 'pending' | 'awaiting_payment' | 'confirmed' | 'cancelled';

export interface OrderItem {
  productId: string;
  productNameSnapshot: string;
  unitPriceSnapshot: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ListOrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Wallet {
  userId: string;
  balance: number;
  currency: string;
  updatedAt: string;
}

export interface Payment {
  found: boolean;
  id?: string;
  orderId?: string;
  userId?: string;
  amount?: number;
  currency?: string;
  status?: 'succeeded' | 'failed';
  failureReason?: string;
}

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}
