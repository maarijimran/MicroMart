import { loginSchema, registerSchema } from './auth.schemas';

describe('Auth request schemas', () => {
  it('accepts a password that meets every required rule', () => {
    const result = registerSchema.safeParse({
      email: 'ADA@EXAMPLE.COM',
      password: 'StrongPass1!',
      firstName: 'Ada',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('ada@example.com');
  });

  it.each(['short1!', 'nouppercase1!', 'NoNumber!', 'NoSpecial1'])(
    'rejects an invalid password',
    (password) => {
      expect(registerSchema.safeParse({ email: 'ada@example.com', password }).success).toBe(false);
    },
  );

  it('does not apply registration password rules to login requests', () => {
    expect(loginSchema.safeParse({ email: 'ada@example.com', password: 'anything' }).success).toBe(true);
  });
});
