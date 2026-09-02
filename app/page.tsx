'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Flame, Globe2, MapPin, Snowflake, Sparkles, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { getDailyGuesstimates } from '@/lib/dailyPicker';
import { useStreakData } from '@/lib/streakStorage';
import type { Guesstimate, QuestionStatus } from '@/lib/types';

const STATUS_META: Record<QuestionStatus, { icon: typeof Circle; className: string }> = {
  Unsolved: { icon: Circle, className: 'bg-[#ececec] text-[#5c5c5c]' },
  'In Progress': { icon: Sparkles, className: 'bg-[#fff4cc] text-accent-dark' },
  Completed: { icon: CheckCircle2, className: 'bg-[#d1fae5] text-factual-dark' },
};

function QuestionCard({ guesstimate, status }: { guesstimate: Guesstimate; status: QuestionStatus }) {
  const StatusIcon = STATUS_META[status].icon;
  return (
    <Link href={`/guesstimate/${guesstimate.id}`}>
      <Card interactive className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${STATUS_META[status].className}`}>
            <StatusIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
            {status}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold text-text-muted">
            {guesstimate.region === 'India' ? <MapPin className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
            {guesstimate.region}
          </span>
        </div>
        <p className="flex-1 text-lg font-extrabold text-foreground">{guesstimate.title}</p>
        <div className="flex flex-wrap gap-2">
          <Badge tone="primary">{guesstimate.category}</Badge>
          <Badge tone="action">{guesstimate.difficulty}</Badge>
          <Badge tone="neutral">{guesstimate.approach}</Badge>
        </div>
      </Card>
    </Link>
  );
}

export default function HomePage() {
  const streak = useStreakData();
  const dailyPair = useMemo(() => getDailyGuesstimates(new Date()), []);
  const statuses = useMemo<Record<string, QuestionStatus>>(() => {
    const map: Record<string, QuestionStatus> = {};
    for (const g of dailyPair) {
      if (streak.completedQuestionIds.includes(g.id)) map[g.id] = 'Completed';
      else if (streak.inProgressIds.includes(g.id)) map[g.id] = 'In Progress';
      else map[g.id] = 'Unsolved';
    }
    return map;
  }, [dailyPair, streak.completedQuestionIds, streak.inProgressIds]);

  const completedToday = dailyPair.filter((g) => statuses[g.id] === 'Completed').length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <Card className="flex flex-col items-center gap-1 text-center">
          <Flame className="h-6 w-6 text-streak" strokeWidth={2.5} fill="#FF9600" />
          <span className="text-2xl font-extrabold text-foreground">{streak.currentStreak}</span>
          <span className="text-xs text-text-muted">Day Streak</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 text-center">
          <Trophy className="h-6 w-6 text-accent" strokeWidth={2.5} />
          <span className="text-2xl font-extrabold text-foreground">{streak.longestStreak}</span>
          <span className="text-xs text-text-muted">Best Streak</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 text-center">
          <Sparkles className="h-6 w-6 text-action" strokeWidth={2.5} />
          <span className="text-2xl font-extrabold text-foreground">{streak.xp}</span>
          <span className="text-xs text-text-muted">Total XP</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 text-center">
          <Snowflake className="h-6 w-6 text-action" strokeWidth={2.5} />
          <span className="text-2xl font-extrabold text-foreground">{streak.freezesAvailable}</span>
          <span className="text-xs text-text-muted">Streak Freeze</span>
        </Card>
      </motion.div>

      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-foreground">Today&apos;s 2 Guesstimates</h1>
          <span className="font-bold text-text-muted">{completedToday}/2 done</span>
        </div>
        <Progress value={(completedToday / 2) * 100} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <QuestionCard guesstimate={dailyPair[0]} status={statuses[dailyPair[0].id] ?? 'Unsolved'} />
        <QuestionCard guesstimate={dailyPair[1]} status={statuses[dailyPair[1].id] ?? 'Unsolved'} />
      </div>

      {completedToday === 2 && (
        <div className="animate-slide-up mt-8 flex items-center gap-3 rounded-2xl border-2 border-[#bff3d1] bg-[#f0fdf6] p-5">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-factual-dark" strokeWidth={2.5} />
          <p className="text-sm font-bold text-factual-dark">
            You&apos;ve completed both of today&apos;s guesstimates. Come back tomorrow to keep your streak alive!
          </p>
        </div>
      )}
    </main>
  );
}
