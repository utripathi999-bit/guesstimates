'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AuthModal } from '@/components/AuthModal';
import { useAuth } from '@/components/AuthProvider';
import { ClarifyingQuestions } from '@/components/ClarifyingQuestions';
import { QuestionRail } from '@/components/QuestionRail';
import { Scratchpad } from '@/components/Scratchpad';
import { SolutionViewer } from '@/components/SolutionViewer';
import { StreakCelebration } from '@/components/StreakCelebration';
import { Button } from '@/components/ui/Button';
import { markQuestionCompleted, markQuestionInProgress, toggleBookmark, useStreakData } from '@/lib/streakStorage';
import type { Guesstimate } from '@/lib/types';

interface GuesstimateViewProps {
  guesstimate: Guesstimate;
  /** Today's pair, resolved server-side — the streak logic needs to know what "both done" means. */
  todaysIds: string[];
}

export function GuesstimateView({ guesstimate, todaysIds }: GuesstimateViewProps) {
  const router = useRouter();
  const streak = useStreakData();
  const { account } = useAuth();

  const [revealed, setRevealed] = useState(false);
  const [celebration, setCelebration] = useState<{ streak: number; freezeUsed: boolean; needsSignIn: boolean } | null>(
    null
  );
  const [authPromptOpen, setAuthPromptOpen] = useState(false);

  const bookmarked = streak.bookmarkedIds.includes(guesstimate.id);
  const status = useMemo(() => {
    if (streak.completedQuestionIds.includes(guesstimate.id)) return 'Completed' as const;
    if (streak.inProgressIds.includes(guesstimate.id)) return 'In Progress' as const;
    return 'Unsolved' as const;
  }, [guesstimate.id, streak.completedQuestionIds, streak.inProgressIds]);

  // Side effect only — writes to the external store, doesn't setState here.
  // `status` reacts automatically once useStreakData re-syncs.
  useEffect(() => {
    if (status === 'Unsolved') {
      markQuestionInProgress(guesstimate.id);
    }
  }, [guesstimate.id, status]);

  function handleMarkSolved() {
    const result = markQuestionCompleted(guesstimate.id, todaysIds);
    if (result.dailyGoalJustCompleted) {
      setCelebration({ streak: result.data.currentStreak, freezeUsed: result.freezeUsed, needsSignIn: !account });
      if (account) {
        fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ streak: result.data.currentStreak }),
        }).catch(() => {
          // Best-effort — the local streak is already saved regardless.
        });
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="lg:grid lg:grid-cols-[330px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <QuestionRail
          guesstimate={guesstimate}
          bookmarked={bookmarked}
          onToggleBookmark={() => toggleBookmark(guesstimate.id)}
        />

        <div className="flex min-w-0 flex-col">
          {status === 'Completed' && (
            <div className="shadow-card mb-6 flex items-center gap-2 rounded-2xl bg-gradient-to-br from-[#f0fdf6] to-[#e3f8cc] px-4 py-3 font-bold text-factual-dark">
              <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              You&apos;ve already completed this one — revisit the solution any time.
            </div>
          )}

          <ClarifyingQuestions guesstimateId={guesstimate.id} suggestedQuestions={guesstimate.clarifyingQuestions} />

          <div className="mb-6">
            <Scratchpad questionId={guesstimate.id} />
          </div>

          {!revealed && (
            <div className="flex justify-center">
              <Button variant="accent" size="lg" onClick={() => setRevealed(true)} className="w-full sm:w-auto">
                <Sparkles className="h-5 w-5" />
                Reveal Step-by-Step Breakdown
              </Button>
            </div>
          )}

          <AnimatePresence>
            {revealed && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <SolutionViewer guesstimate={guesstimate} />

                <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                  <Button variant="neutral" onClick={() => router.push('/')}>
                    Back to Today
                  </Button>
                  {status !== 'Completed' && (
                    <Button variant="primary" size="lg" onClick={handleMarkSolved} className="w-full sm:w-auto">
                      <CheckCircle2 className="h-5 w-5" />
                      Mark as Solved
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <StreakCelebration
        open={celebration !== null}
        onClose={() => setCelebration(null)}
        streak={celebration?.streak ?? 0}
        freezeUsed={celebration?.freezeUsed ?? false}
        needsSignIn={celebration?.needsSignIn ?? false}
        onSignInClick={() => {
          setCelebration(null);
          setAuthPromptOpen(true);
        }}
      />
      <AuthModal open={authPromptOpen} onClose={() => setAuthPromptOpen(false)} />
    </main>
  );
}
