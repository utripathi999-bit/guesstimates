'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, BookmarkCheck, CheckCircle2, Globe2, MapPin, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AuthModal } from '@/components/AuthModal';
import { useAuth } from '@/components/AuthProvider';
import { ClarifyingQuestions } from '@/components/ClarifyingQuestions';
import { Scratchpad } from '@/components/Scratchpad';
import { SolutionViewer } from '@/components/SolutionViewer';
import { StreakCelebration } from '@/components/StreakCelebration';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getGuesstimateById } from '@/lib/dailyPicker';
import { markQuestionCompleted, markQuestionInProgress, toggleBookmark, useStreakData } from '@/lib/streakStorage';

export default function GuesstimatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const guesstimate = getGuesstimateById(params.id);
  const streak = useStreakData();
  const { account } = useAuth();

  const [revealed, setRevealed] = useState(false);
  const [celebration, setCelebration] = useState<{ streak: number; freezeUsed: boolean; needsSignIn: boolean } | null>(
    null
  );
  const [authPromptOpen, setAuthPromptOpen] = useState(false);

  const bookmarked = guesstimate ? streak.bookmarkedIds.includes(guesstimate.id) : false;
  const status = useMemo(() => {
    if (!guesstimate) return 'Unsolved' as const;
    if (streak.completedQuestionIds.includes(guesstimate.id)) return 'Completed' as const;
    if (streak.inProgressIds.includes(guesstimate.id)) return 'In Progress' as const;
    return 'Unsolved' as const;
  }, [guesstimate, streak.completedQuestionIds, streak.inProgressIds]);

  // Side effect only — writes to the external store, doesn't setState here.
  // The `status` above reacts automatically once useStreakData re-syncs.
  useEffect(() => {
    if (guesstimate && status === 'Unsolved') {
      markQuestionInProgress(guesstimate.id);
    }
  }, [guesstimate, status]);

  if (!guesstimate) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-foreground">Question not found</h1>
        <p className="text-text-muted">This guesstimate doesn&apos;t exist in the current dataset.</p>
        <Link href="/">
          <Button variant="primary">Back to Today</Button>
        </Link>
      </main>
    );
  }

  function handleReveal() {
    setRevealed(true);
  }

  function handleMarkSolved() {
    if (!guesstimate) return;
    const result = markQuestionCompleted(guesstimate.id);
    if (result.dailyGoalJustCompleted) {
      setCelebration({ streak: result.data.currentStreak, freezeUsed: result.freezeUsed, needsSignIn: !account });
      if (account) {
        fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ streak: result.data.currentStreak }),
        }).catch(() => {
          // Leaderboard sync is best-effort — the local streak already saved regardless.
        });
      }
    }
  }

  function handleToggleBookmark() {
    if (!guesstimate) return;
    toggleBookmark(guesstimate.id);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{guesstimate.category}</Badge>
          <Badge tone="action">{guesstimate.difficulty}</Badge>
          <Badge tone="neutral">{guesstimate.approach}</Badge>
          <span className="flex items-center gap-1 text-sm font-bold text-text-muted">
            {guesstimate.region === 'India' ? <MapPin className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}
            {guesstimate.region}
          </span>
        </div>
        <button
          onClick={handleToggleBookmark}
          aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
          className={`rounded-full p-2 transition-colors ${bookmarked ? 'bg-[#fff4cc] text-accent-dark' : 'text-accent-dark hover:bg-black/5'}`}
        >
          {bookmarked ? <BookmarkCheck className="h-6 w-6" fill="currentColor" /> : <Bookmark className="h-6 w-6" />}
        </button>
      </div>

      <h1 className="text-display mb-6 text-3xl font-black leading-tight text-foreground sm:text-4xl">{guesstimate.title}</h1>

      {status === 'Completed' && (
        <div className="shadow-card mb-6 flex items-center gap-2 rounded-2xl bg-gradient-to-br from-[#f0fdf6] to-[#e3f8cc] px-4 py-3 font-bold text-factual-dark">
          <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
          You&apos;ve already completed this one — revisit the solution any time.
        </div>
      )}

      <ClarifyingQuestions guesstimateId={guesstimate.id} suggestedQuestions={guesstimate.clarifyingQuestions} />

      <div className="mb-6">
        <Scratchpad questionId={guesstimate.id} questionTitle={guesstimate.title} />
      </div>

      {!revealed && (
        <div className="flex justify-center">
          <Button variant="accent" size="lg" onClick={handleReveal} className="w-full sm:w-auto">
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
            className="mt-6"
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
