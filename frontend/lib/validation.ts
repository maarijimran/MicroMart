import { z } from 'zod';
import { ApiError } from './api';

// Client-side rules mirror the services' own Zod schemas so problems are
// caught before a request is sent. The services still validate everything.

export type FieldErrors = Partial<Record<string, string>>;

export const MAX_PRODUCT_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const required = (message: string) => z.string({ error: message }).trim().min(1, message);

const email = required('Enter your email address.')
  .max(320, 'Email must be 320 characters or fewer.')
  .pipe(z.email('Enter a valid email address, like name@example.com.'));

/** Text input → number, with distinct messages for blank and non-numeric input. */
const numeric = (missing: string, invalid: string) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return undefined;
      return typeof value === 'string' ? Number(value.trim()) : value;
    },
    z.number({ error: (issue) => (issue.input === undefined ? missing : invalid) }),
  );

const hasAtMostTwoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

const slug = required('Enter a slug.')
  .max(200, 'Slug must be 200 characters or fewer.')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug can only contain lowercase letters, numbers and single hyphens.');

// ---------------- Auth ----------------

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(256, 'Password must be 256 characters or fewer.'),
});

export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export const registerSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .max(100, 'First name must be 100 characters or fewer.')
      .regex(/^[\p{L}\p{M}' .-]*$/u, 'First name can only contain letters, spaces, hyphens and apostrophes.')
      .optional(),
    email,
    password: z
      .string()
      .min(1, 'Create a password.')
      .min(8, 'Password must be at least 8 characters long.')
      .regex(/[A-Z]/, 'Password must include an uppercase letter.')
      .regex(/[0-9]/, 'Password must include a number.')
      .regex(/[^A-Za-z0-9]/, 'Password must include a special character.')
      .refine((value) => new TextEncoder().encode(value).length <= 72, 'Password must be 72 characters or fewer.'),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords don’t match.',
  });

// ---------------- Catalog (admin) ----------------

export const categorySchema = z.object({
  name: required('Enter a category name.').max(150, 'Category name must be 150 characters or fewer.'),
  slug,
});

export const productSchema = z.object({
  categoryId: required('Choose a category.'),
  name: required('Enter a product name.').max(200, 'Product name must be 200 characters or fewer.'),
  sku: required('Enter a SKU.')
    .max(64, 'SKU must be 64 characters or fewer.')
    .regex(/^[A-Za-z0-9._-]+$/, 'SKU can only contain letters, numbers, dots, hyphens and underscores.'),
  slug,
  description: z.string().trim().max(5000, 'Description must be 5,000 characters or fewer.'),
  price: numeric('Enter a price.', 'Price must be a number.').pipe(
    z
      .number()
      .positive('Price must be greater than 0.')
      .max(1_000_000, 'Price can’t be more than 1,000,000.')
      .refine(hasAtMostTwoDecimals, 'Price can have at most 2 decimal places.'),
  ),
  initialQuantity: numeric('Enter a stock quantity.', 'Stock must be a number.').pipe(
    z
      .number()
      .int('Stock must be a whole number.')
      .nonnegative('Stock can’t be negative.')
      .max(1_000_000, 'Stock can’t be more than 1,000,000.'),
  ),
  images: z
    .array(z.instanceof(File))
    .min(1, 'Add at least one product photo.')
    .max(MAX_PRODUCT_IMAGES, `You can upload up to ${MAX_PRODUCT_IMAGES} photos.`)
    .superRefine((files, ctx) => {
      for (const file of files) {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          ctx.addIssue({ code: 'custom', message: `“${file.name}” isn’t a JPEG, PNG or WebP image.` });
          return;
        }
        if (file.size === 0) {
          ctx.addIssue({ code: 'custom', message: `“${file.name}” is empty.` });
          return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          ctx.addIssue({ code: 'custom', message: `“${file.name}” is larger than 5 MB.` });
          return;
        }
      }
    }),
});

export const stockSchema = z.object({
  quantity: numeric('Enter a quantity.', 'Quantity must be a number.').pipe(
    z
      .number()
      .int('Quantity must be a whole number.')
      .nonnegative('Quantity can’t be negative.')
      .max(1_000_000, 'Quantity can’t be more than 1,000,000.'),
  ),
});

// ---------------- Wallets (admin) ----------------

export const seedWalletSchema = z.object({
  userId: required('Enter the customer’s account ID.').pipe(z.uuid('Enter a valid account ID.')),
  balance: numeric('Enter a balance.', 'Balance must be a number.').pipe(
    z
      .number()
      .nonnegative('Balance can’t be negative.')
      .max(1_000_000, 'Balance can’t be more than 1,000,000.')
      .refine(hasAtMostTwoDecimals, 'Balance can have at most 2 decimal places.'),
  ),
});

// ---------------- Shop filters ----------------

export const searchSchema = z.object({
  q: z.string().trim().max(200, 'Search must be 200 characters or fewer.'),
});

const optionalPrice = (label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? Number(value) : value),
    z.number({ error: `${label} price must be a number.` }).nonnegative(`${label} price can’t be negative.`).optional(),
  );

export const priceFilterSchema = z
  .object({ min: optionalPrice('Minimum'), max: optionalPrice('Maximum') })
  .refine((v) => v.min === undefined || v.max === undefined || v.min <= v.max, {
    path: ['min'],
    message: 'Minimum price can’t be more than the maximum.',
  });

/**
 * Browsers derive File.type from the extension, so a renamed file passes the
 * type check above. This reads each file's first bytes (as Catalog does) to
 * catch that before upload. Returns an error message, or null if all are real images.
 */
export async function findNonImage(files: File[]): Promise<string | null> {
  for (const file of files) {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
    const isWebp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    if (!isJpeg && !isPng && !isWebp) return `“${file.name}” isn’t a JPEG, PNG or WebP image.`;
  }
  return null;
}

// ---------------- Helpers ----------------

export type ValidationResult<T> = { data: T; errors: null } | { data: null; errors: FieldErrors };

/** Runs a schema and returns the first message per field. */
export function validate<S extends z.ZodType>(schema: S, values: unknown): ValidationResult<z.output<S>> {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return { data: null, errors };
}

/** Pulls field errors and a readable summary out of a failed API call. */
export function readApiError(error: unknown, fallback = 'Something went wrong. Please try again.') {
  const fields: FieldErrors = {};
  if (error instanceof ApiError) {
    const fieldErrors = (error.errors as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors ?? {};
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages?.[0]) fields[field] = messages[0];
    }
    if (error.status === 429) return { fields, message: 'Too many attempts. Please wait a minute and try again.' };
    if (error.status >= 500) return { fields, message: 'We couldn’t complete that right now. Please try again.' };
    return { fields, message: error.message || fallback };
  }
  if (error instanceof TypeError) return { fields, message: 'Can’t connect. Check your internet connection and try again.' };
  return { fields, message: fallback };
}
