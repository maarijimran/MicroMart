'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Skeleton } from './ui/Card';

export function ProtectedRoute({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { auth, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!auth) {
      router.replace('/login');
    } else if (requireAdmin && auth.user.role !== 'admin') {
      router.replace('/');
    }
  }, [auth, loading, requireAdmin, router]);

  if (loading || !auth || (requireAdmin && auth.user.role !== 'admin')) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Checking access">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-8 h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return <>{children}</>;
}
