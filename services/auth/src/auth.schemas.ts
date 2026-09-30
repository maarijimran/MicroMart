import { z } from 'zod';

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters long.')
  // bcrypt only uses the first 72 bytes — anything longer would be silently truncated.
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be 72 characters or fewer.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/[0-9]/, 'Password must include a number.')
  .regex(/[^A-Za-z0-9]/, 'Password must include a special character.');

export const registerSchema = z.object({
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password,
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(256),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
export const logoutSchema = z.object({ refreshToken: z.string().min(1) });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
