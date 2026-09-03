'use client';

import confetti from 'canvas-confetti';
import { Flame, Snowflake } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface StreakCelebrationProps {
  open: boolean;
  onClose: () => void;
  streak: number;
  freezeUsed?: boolean;
  /** Whether both of today's questions are done, or just the one. */
  bothDone?: boolean;
  pointsEarned?: number;
}

function fireConfetti(big: boolean) {
  const colors = ['#58CC02', '#FFC800', '#1CB0F6', '#FF9600'];
  confetti({
    particleCount: big ? 120 : 70,
    spread: big ? 90 : 60,
    origin: { y: 0.6 },
    colors,
    startVelocity: big ? 45 : 35,
    zIndex: 9999,
  });
  if (big) {
    setTimeout(() => {
      confetti({ particleCount: 60, angle: 60, spread: 70, origin: { x: 0 }, colors, zIndex: 9999 });
      confetti({ particleCount: 60, angle: 120, spread: 70, origin: { x: 1 }, colors, zIndex: 9999 });
    }, 200);
  }
}

export function StreakCelebration({
  open,
  onClose,
  streak,
  freezeUsed,
  bothDone,
  pointsEarned = 0,
}: StreakCelebrationProps) {
  useEffect(() => {
    if (open) fireConfetti(Boolean(bothDone));
  }, [open, bothDone]);

  return (
    <Modal open={open} onClose={onClose} className="text-center">
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#ffdca8] to-[#ffb44d] shadow-[0_8px_20px_-6px_hsl(35_100%_50%/0.5)]">
          <Flame className="animate-flame-flicker h-11 w-11 text-white" strokeWidth={2.5} fill="white" />
        </div>

        <h2 className="text-display text-2xl font-black text-foreground">
          {bothDone ? 'Both done today!' : 'Streak kept alive!'}
        </h2>

        <p className="text-text-muted">
          {bothDone
            ? "You've solved both of today's guesstimates. Your streak is now "
            : "That's one down today — enough to keep your streak going. Your streak is now "}
          <span className="font-black text-streak">
            {streak} day{streak === 1 ? '' : 's'}
          </span>
          .
        </p>

        {pointsEarned > 0 && (
          <span className="rounded-full bg-callout-success px-3 py-1 text-sm font-black text-callout-success-text">
            +{pointsEarned} points
          </span>
        )}

        {!bothDone && (
          <p className="text-sm text-text-muted">Solve the other one today for a bonus.</p>
        )}

        {freezeUsed && (
          <div className="flex items-center gap-2 rounded-xl bg-callout-info px-3 py-2 text-sm font-bold text-callout-info-text">
            <Snowflake className="h-4 w-4" strokeWidth={2.5} />
            A streak freeze saved yesterday&apos;s gap!
          </div>
        )}

        <Button variant="primary" size="md" onClick={onClose} className="mt-2 w-full">
          Nice!
        </Button>
      </div>
    </Modal>
  );
}
