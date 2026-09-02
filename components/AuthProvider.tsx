'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { getStreakData } from '@/lib/streakStorage';

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

/**
 * Pushes the browser's current local streak to the leaderboard. The
 * completion flow already does this the instant both daily questions are
 * solved while signed in — but that's a single point-in-time trigger. If
 * someone solved today's questions *before* signing in (or signs in on a
 * new device that already has a streak), nothing would otherwise ever tell
 * the leaderboard about it. Calling this on every sign-in and on every
 * "already signed in" page load keeps it caught up regardless of ordering.
 */
function syncLeaderboard() {
  const { currentStreak } = getStreakData();
  if (currentStreak <= 0) return;
  fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ streak: currentStreak }),
  }).catch(() => {
    // Best-effort — local streak is already saved regardless.
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data: { account: AuthAccount | null } = await res.json();
      setAccount(data.account);
      if (data.account) syncLeaderboard();
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
      syncLeaderboard();
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
    syncLeaderboard();
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
