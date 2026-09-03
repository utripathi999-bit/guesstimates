'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { EMPTY_PROGRESS, type UserProgress } from '@/lib/progress';
import type { QuestionStatus } from '@/lib/types';

export interface SolveOutcome {
  pointsEarned: number;
  dailyGoalJustCompleted: boolean;
  freezeUsed: boolean;
  streak: number;
}

interface ProgressContextValue {
  progress: UserProgress;
  loading: boolean;
  statusOf: (questionId: string) => QuestionStatus;
  attempt: (questionId: string) => void;
  solve: (questionId: string) => Promise<SolveOutcome | null>;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

/**
 * Progress lives on the server, keyed to the account — so it follows you
 * across devices, and the points are whatever the server's rules produced
 * rather than whatever the browser claims.
 */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const { account } = useAuth();
  const [progress, setProgress] = useState<UserProgress>(EMPTY_PROGRESS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!account) {
      setProgress(EMPTY_PROGRESS);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/progress');
      const data: { progress: UserProgress } = await res.json();
      setProgress(data.progress ?? EMPTY_PROGRESS);
    } catch {
      setProgress(EMPTY_PROGRESS);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    // Deliberate: progress can only come from the network, so there's nothing
    // to derive during render — fetch on mount and whenever the account changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const statusOf = useCallback(
    (questionId: string): QuestionStatus => {
      if (progress.completedQuestionIds.includes(questionId)) return 'Completed';
      if (progress.attemptedQuestionIds.includes(questionId)) return 'In Progress';
      return 'Unsolved';
    },
    [progress.completedQuestionIds, progress.attemptedQuestionIds]
  );

  const attempt = useCallback(
    (questionId: string) => {
      if (!account) return;
      if (progress.attemptedQuestionIds.includes(questionId)) return;
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attempt', questionId }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { progress: UserProgress } | null) => {
          if (data?.progress) setProgress(data.progress);
        })
        .catch(() => {
          // Best-effort: an unrecorded attempt costs 5 points, not correctness.
        });
    },
    [account, progress.attemptedQuestionIds]
  );

  const solve = useCallback(
    async (questionId: string): Promise<SolveOutcome | null> => {
      if (!account) return null;
      try {
        const res = await fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'solve', questionId }),
        });
        if (!res.ok) return null;
        const data: {
          progress: UserProgress;
          pointsEarned: number;
          dailyGoalJustCompleted: boolean;
          freezeUsed: boolean;
        } = await res.json();

        setProgress(data.progress);
        return {
          pointsEarned: data.pointsEarned,
          dailyGoalJustCompleted: data.dailyGoalJustCompleted,
          freezeUsed: data.freezeUsed,
          streak: data.progress.currentStreak,
        };
      } catch {
        return null;
      }
    },
    [account]
  );

  return (
    <ProgressContext.Provider value={{ progress, loading, statusOf, attempt, solve }}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used within a ProgressProvider');
  return ctx;
}
