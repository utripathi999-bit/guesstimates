'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Flame, Globe2, MapPin, Snowflake, Sparkles, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { useProgress } from '@/components/ProgressProvider';
import type { Guesstimate, QuestionStatus } from '@/lib/types';

const STATUS_META: Record<QuestionStatus, { icon: typeof Circle; className: string }> = {
  Unsolved: { icon: Circle, className: 'bg-[#ececec] text-[#5c5850]' },
  'In Progress': { icon: Sparkles, className: 'bg-[#fff4cc] text-accent-dark' },
  Completed: { icon: CheckCircle2, className: 'bg-[#d1fae5] text-factual-dark' },
};

const STAT_TILES = [
  { key: 'currentStreak', label: 'Day Streak', icon: Flame, from: '#ffdca8', to: '#ffb44d', text: '#8a4b00' },
  { key: 'longestStreak', label: 'Best Streak', icon: Trophy, from: '#fff0ad', to: '#ffe066', text: '#836a00' },
  { key: 'xp', label: 'Total XP', icon: Sparkles, from: '#aee6fd', to: '#7ed2fb', text: '#0a5b82' },
  { key: 'freezesAvailable', label: 'Streak Freeze', icon: Snowflake, from: '#c8e9fd', to: '#9fd6fb', text: '#0a5b82' },
] as const;

function QuestionCard({ guesstimate, status }: { guesstimate: Guesstimate; status: QuestionStatus }) {
  const StatusIcon = STATUS_META[status].icon;
  const accent = guesstimate.region === 'India' ? 'from-primary to-primary-dark' : 'from-action to-action-dark';
  return (
    <Link href={`/guesstimate/${guesstimate.id}`}>
      <Card interactive className="flex h-full flex-col gap-3 overflow-hidden !p-0">
        <div className={`h-1.5 w-full bg-gradient-to-r ${accent}`} />
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${STATUS_META[status].className}`}>
              <StatusIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
              {status}
            </span>
            <span className="flex items-center gap-1 text-xs font-bold text-text-muted">
              {guesstimate.region === 'India' ? <MapPin className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
              {guesstimate.region}
            </span>
          </div>
          <p className="flex-1 text-xl font-black leading-snug text-foreground">{guesstimate.title}</p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="primary">{guesstimate.category}</Badge>
            <Badge tone="action">{guesstimate.difficulty}</Badge>
            <Badge tone="neutral">{guesstimate.approach}</Badge>
          </div>
        </div>
      </Card>
    </Link>
  );
}

interface TodayViewProps {
  dailyPair: [Guesstimate, Guesstimate];
  /** Whether today's pair was freshly generated or fell back to the seed set. */
  source: 'ai' | 'static';
}

export function TodayView({ dailyPair, source }: TodayViewProps) {
  const { progress, statusOf } = useProgress();
  const statuses = useMemo<Record<string, QuestionStatus>>(() => {
    const map: Record<string, QuestionStatus> = {};
    for (const g of dailyPair) map[g.id] = statusOf(g.id);
    return map;
  }, [dailyPair, statusOf]);

  const completedToday = dailyPair.filter((g) => statuses[g.id] === 'Completed').length;
  const statValues: Record<(typeof STAT_TILES)[number]['key'], number> = {
    currentStreak: progress.currentStreak,
    longestStreak: progress.longestStreak,
    xp: progress.points,
    freezesAvailable: progress.freezesAvailable,
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {STAT_TILES.map(({ key, label, icon: Icon, from, to, text }) => (
          <Card key={key} className="flex flex-col items-center gap-2 text-center">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ background: `linear-gradient(135deg, ${from}, ${to})`, color: text }}
            >
              <Icon className="h-5 w-5" strokeWidth={2.5} fill={key === 'currentStreak' ? text : 'none'} />
            </span>
            <span className="text-2xl font-black tabular-nums text-foreground">{statValues[key]}</span>
            <span className="text-xs font-bold text-text-muted">{label}</span>
          </Card>
        ))}
      </motion.div>

      <div className="mb-8">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary-dark">
              Today
              {source === 'ai' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f3e8ff] px-2 py-0.5 text-assumed-dark">
                  <Sparkles className="h-3 w-3" strokeWidth={3} />
                  Freshly written
                </span>
              )}
            </p>
            <h1 className="text-display text-3xl font-black text-foreground">Your 2 Guesstimates</h1>
          </div>
          <span className="font-black tabular-nums text-text-muted">{completedToday}/2 done</span>
        </div>
        <Progress value={(completedToday / 2) * 100} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <QuestionCard guesstimate={dailyPair[0]} status={statuses[dailyPair[0].id] ?? 'Unsolved'} />
        <QuestionCard guesstimate={dailyPair[1]} status={statuses[dailyPair[1].id] ?? 'Unsolved'} />
      </div>

      {completedToday === 2 && (
        <div className="animate-slide-up shadow-card mt-8 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-callout-success to-callout-success-edge p-5 text-callout-success-text">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-factual-dark" strokeWidth={2.5} />
          <p className="text-sm font-bold text-factual-dark">
            You&apos;ve completed both of today&apos;s guesstimates. Come back tomorrow to keep your streak alive!
          </p>
        </div>
      )}
    </main>
  );
}
