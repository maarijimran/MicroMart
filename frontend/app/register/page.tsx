'use client';

import { Check, Lock, Mail, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthShell, FormError } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/format';
import { PASSWORD_RULES, readApiError, registerSchema, validate, type FieldErrors } from '@/lib/validation';

export default function RegisterPage() {
  const { register, login } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [values, setValues] = useState({ firstName: '', email: '', password: '', confirmPassword: '' });
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
    const result = validate(registerSchema, { ...values, firstName: values.firstName || undefined });
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    const { email, password, firstName } = result.data;
    setSubmitting(true);
    try {
      await register(email, password, firstName || undefined);
    } catch (err) {
      const { fields, message } = readApiError(err, 'We couldn’t create your account. Please try again.');
      setErrors(fields);
      setFormError(message);
      setSubmitting(false);
      return;
    }
    try {
      await login(email, password);
      toast({ tone: 'success', title: 'Account created' });
      router.push('/');
    } catch {
      toast({ tone: 'success', title: 'Account created', description: 'Please log in.' });
      router.push('/login');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create an account"
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field
          label="First name (optional)"
          autoComplete="given-name"
          icon={User}
          placeholder="Your first name"
          value={values.firstName}
          error={errors.firstName}
          onChange={(e) => set('firstName')(e.target.value)}
        />
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
        <div>
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            icon={Lock}
            placeholder="Create a password"
            value={values.password}
            error={errors.password}
            onChange={(e) => set('password')(e.target.value)}
          />
          <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {PASSWORD_RULES.map((rule) => {
              const passed = rule.test(values.password);
              return (
                <li key={rule.label} className={cn('flex items-center gap-1.5 text-xs', passed ? 'text-success' : 'text-subtle')}>
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 items-center justify-center rounded-full border',
                      passed ? 'border-success bg-success text-white' : 'border-line-strong',
                    )}
                  >
                    {passed && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                  </span>
                  {rule.label}
                </li>
              );
            })}
          </ul>
        </div>
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          icon={Lock}
          placeholder="Re-enter your password"
          value={values.confirmPassword}
          error={errors.confirmPassword}
          onChange={(e) => set('confirmPassword')(e.target.value)}
        />
        <FormError message={formError} />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
