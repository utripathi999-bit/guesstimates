'use client';

import { motion, useAnimation, useMotionValue, useTransform } from 'framer-motion';
import { Eye, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { FactFlashcard } from '@/lib/types';

interface SwipeCardProps {
  fact: FactFlashcard;
  onSwipe: (direction: 'left' | 'right') => void;
  zIndex: number;
  isTop: boolean;
}

const SWIPE_THRESHOLD = 120;

export function SwipeCard({ fact, onSwipe, zIndex, isTop }: SwipeCardProps) {
  const [revealed, setRevealed] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-18, 18]);
  const knowOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const reviseOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);
  const controls = useAnimation();

  async function handleDragEnd(_: unknown, info: { offset: { x: number } }) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      await controls.start({ x: 500, opacity: 0, transition: { duration: 0.3 } });
      onSwipe('right');
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      await controls.start({ x: -500, opacity: 0, transition: { duration: 0.3 } });
      onSwipe('left');
    } else {
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
    }
  }

  return (
    <motion.div
      className="absolute inset-0"
      style={{ x, rotate, zIndex }}
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      animate={controls}
      initial={{ scale: 1 }}
    >
      <div
        onClick={() => setRevealed((r) => !r)}
        className="relative flex h-full w-full cursor-grab select-none flex-col justify-between overflow-hidden rounded-3xl bg-surface p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04),0_24px_48px_-16px_rgba(0,0,0,0.18)] active:cursor-grabbing"
      >
        <div className={`absolute inset-x-0 top-0 h-2 bg-gradient-to-r ${fact.region === 'India' ? 'from-primary to-primary-dark' : 'from-action to-action-dark'}`} />

        <div className="flex items-center justify-between pt-1">
          <Badge tone="action">{fact.category}</Badge>
          <Badge tone="neutral">{fact.region}</Badge>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-xl font-black text-foreground">{fact.metric}?</p>
          {revealed ? (
            <div className="animate-pop flex flex-col items-center gap-2">
              <p className="text-3xl font-black text-primary-dark">{fact.value}</p>
              <p className="text-sm text-text-muted">{fact.contextSnippet}</p>
            </div>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-[#d3eefd] px-3 py-1.5 text-sm font-bold text-action-dark">
              <Eye className="h-4 w-4" strokeWidth={2.5} />
              Tap to reveal
            </span>
          )}
        </div>

        <div className="flex items-center justify-center gap-1 text-xs font-medium text-text-muted">
          <RotateCcw className="h-3.5 w-3.5" />
          Swipe right if you knew it, left to revise
        </div>

        <motion.div
          style={{ opacity: knowOpacity }}
          className="pointer-events-none absolute right-6 top-8 -rotate-12 rounded-lg border-4 border-primary bg-white/80 px-3 py-1 text-xl font-black text-primary"
        >
          KNEW IT
        </motion.div>
        <motion.div
          style={{ opacity: reviseOpacity }}
          className="pointer-events-none absolute left-6 top-8 rotate-12 rounded-lg border-4 border-danger bg-white/80 px-3 py-1 text-xl font-black text-danger"
        >
          REVISE
        </motion.div>
      </div>
    </motion.div>
  );
}
