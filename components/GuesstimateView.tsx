'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ClarifyingQuestions } from '@/components/ClarifyingQuestions';
import { useProgress } from '@/components/ProgressProvider';
import { QuestionRail } from '@/components/QuestionRail';
import { Scratchpad } from '@/components/Scratchpad';
import { SolutionViewer } from '@/components/SolutionViewer';
import { StreakCelebration } from '@/components/StreakCelebration';
import { Button } from '@/components/ui/Button';
import { toggleBookmark, useStreakData } from '@/lib/streakStorage';
import type { Guesstimate } from '@/lib/types';

interface GuesstimateViewProps {
  guesstimate: Guesstimate;
}

export function GuesstimateView({ guesstimate }: GuesstimateViewProps) {
  const router = useRouter();
  const { statusOf, attempt, solve } = useProgress();
  // Bookmarks stay per-device — they're a personal reading aid, not scored progress.
  const localPrefs = useStreakData();

  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [celebration, setCelebration] = useState<{
    streak: number;
    freezeUsed: boolean;
    bothDone: boolean;
    pointsEarned: number;
  } | null>(null);

  const bookmarked = localPrefs.bookmarkedIds.includes(guesstimate.id);
  const status = statusOf(guesstimate.id);

  // Side effect only — reports the attempt to the server, which decides
  // whether it's worth anything. `attempt` is a no-op once already recorded.
  useEffect(() => {
    attempt(guesstimate.id);
  }, [attempt, guesstimate.id]);

  async function handleMarkSolved() {
    setSaving(true);
    const outcome = await solve(guesstimate.id);
    setSaving(false);
    // Celebrate whenever the streak advances — solving one of the day's
    // questions is enough to keep it alive, not just finishing both.
    if (outcome?.streakAdvanced) {
      setCelebration({
        streak: outcome.streak,
        freezeUsed: outcome.freezeUsed,
        bothDone: outcome.bothDoneToday,
        pointsEarned: outcome.pointsEarned,
      });
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
            <div className="shadow-card mb-6 flex items-center gap-2 rounded-2xl bg-gradient-to-br from-callout-success to-callout-success-edge px-4 py-3 font-bold text-callout-success-text">
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
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                <SolutionViewer guesstimate={guesstimate} />

                <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                  <Button variant="neutral" onClick={() => router.push('/')}>
                    Back to Today
                  </Button>
                  {status !== 'Completed' && (
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleMarkSolved}
                      disabled={saving}
                      className="w-full sm:w-auto"
                    >
                      <CheckCircle2 className="h-5 w-5" />
                      {saving ? 'Saving...' : 'Mark as Solved'}
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
        bothDone={celebration?.bothDone ?? false}
        pointsEarned={celebration?.pointsEarned ?? 0}
      />
    </main>
  );
}
