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
}

function fireConfetti() {
  const colors = ['#58CC02', '#FFC800', '#1CB0F6', '#FF9600'];
  confetti({
    particleCount: 120,
    spread: 90,
    origin: { y: 0.6 },
    colors,
    startVelocity: 45,
    zIndex: 9999,
  });
  setTimeout(() => {
    confetti({ particleCount: 60, angle: 60, spread: 70, origin: { x: 0 }, colors, zIndex: 9999 });
    confetti({ particleCount: 60, angle: 120, spread: 70, origin: { x: 1 }, colors, zIndex: 9999 });
  }, 200);
}

export function StreakCelebration({ open, onClose, streak, freezeUsed }: StreakCelebrationProps) {
  useEffect(() => {
    if (open) fireConfetti();
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} className="text-center">
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#fff4e5]">
          <Flame className="animate-flame-flicker h-11 w-11 text-streak" strokeWidth={2.5} fill="#FF9600" />
        </div>
        <h2 className="text-2xl font-extrabold text-foreground">Daily Goal Complete!</h2>
        <p className="text-text-muted">
          You&apos;ve solved both of today&apos;s guesstimates. Your streak is now{' '}
          <span className="font-extrabold text-streak">{streak} day{streak === 1 ? '' : 's'}</span>.
        </p>

        {freezeUsed && (
          <div className="flex items-center gap-2 rounded-xl bg-[#d3eefd] px-3 py-2 text-sm font-bold text-action-dark">
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
