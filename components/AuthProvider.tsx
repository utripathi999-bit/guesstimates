'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export interface AuthAccount {
  email: string;
  displayName: string;
}

interface AuthResult {
  success: boolean;
  error?: string;
}

interface AuthContextValue {
  account: AuthAccount | null;
  loading: boolean;
  signup: (email: string, password: string, displayName: string) => Promise<AuthResult>;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data: { error?: string } = await res.json();
    return data.error ?? 'Something went wrong';
  } catch {
    return 'Something went wrong';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data: { account: AuthAccount | null } = await res.json();
      setAccount(data.account);
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deliberate effect: the session cookie can only be checked via a network
    // round-trip (no client-computable/derivable value), so "fetch on mount,
    // setState with the result" is the standard pattern here absent a data
    // library like SWR/React Query.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const signup = useCallback(
    async (email: string, password: string, displayName: string): Promise<AuthResult> => {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      if (!res.ok) return { success: false, error: await parseErrorMessage(res) };
      const data: { account: AuthAccount } = await res.json();
      setAccount(data.account);
      return { success: true };
    },
    []
  );

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return { success: false, error: await parseErrorMessage(res) };
    const data: { account: AuthAccount } = await res.json();
    setAccount(data.account);
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAccount(null);
  }, []);

  return (
    <AuthContext.Provider value={{ account, loading, signup, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
