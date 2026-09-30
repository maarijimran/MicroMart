'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as api from '@/lib/api';
import type { AuthUser } from '@/lib/types';

interface AuthState {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  auth: AuthState | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'micromart.auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  // NOTE: storing the JWT in localStorage is a deliberate simplification for
  // this learning project — it's readable by any script on the page (an XSS
  // risk a real product would avoid with an httpOnly cookie set by a
  // server-side BFF layer). Kept simple here on purpose; see setup.md.
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        // One-time hydration from localStorage on mount — genuinely fires
        // only once (empty dependency array), not a cascading-render risk
        // in practice. The alternative (useSyncExternalStore) is the more
        // "correct" fix for this lint rule, but adds real complexity for a
        // pattern this project only needs once, here and in CartContext.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAuth(JSON.parse(raw));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  function persist(next: AuthState | null) {
    setAuth(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }

  async function login(email: string, password: string) {
    const result = await api.login(email, password);
    persist({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
  }

  async function register(email: string, password: string, firstName?: string) {
    await api.register(email, password, firstName);
  }

  async function logout() {
    if (auth) {
      try {
        await api.logout(auth.refreshToken);
      } catch {
        // Best-effort — clear local state regardless of whether the server
        // call succeeded, so a flaky network never traps the user logged in.
      }
    }
    persist(null);
  }

  return (
    <AuthContext.Provider value={{ auth, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
