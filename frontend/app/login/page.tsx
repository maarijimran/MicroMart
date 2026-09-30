'use client';

import { Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthShell, FormError } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { loginSchema, readApiError, validate, type FieldErrors } from '@/lib/validation';

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof typeof values) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const result = validate(loginSchema, values);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    setSubmitting(true);
    try {
      await login(result.data.email, result.data.password);
      toast({ tone: 'success', title: 'Welcome back' });
      router.push('/');
    } catch (err) {
      const { fields, message } = readApiError(err, 'Login failed. Please try again.');
      setErrors(fields);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Log in"
      footer={
        <>
          New to MicroMart?{' '}
          <Link href="/register" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          icon={Mail}
          placeholder="name@example.com"
          value={values.email}
          error={errors.email}
          onChange={(e) => set('email')(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          icon={Lock}
          placeholder="Enter your password"
          value={values.password}
          error={errors.password}
          onChange={(e) => set('password')(e.target.value)}
        />
        <FormError message={formError} />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthShell>
  );
}
