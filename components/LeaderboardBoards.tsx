'use client';

import { Flame, Medal, Trophy } from 'lucide-react';
import { useState } from 'react';
import type { LeaderboardEntry } from '@/lib/leaderboard';

type Period = 'week' | 'all';

interface LeaderboardBoardsProps {
  weekly: LeaderboardEntry[];
  allTime: LeaderboardEntry[];
  /** Pre-rendered on the server so the two sides never disagree about "now". */
  timeLeft: string;
}

function RankBadge({ rank, isZero }: { rank: number; isZero: boolean }) {
  if (isZero || rank > 3) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background font-black text-text-muted">
        {rank}
      </div>
    );
  }
  if (rank === 1) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-dark text-white shadow-[0_3px_8px_-2px_hsl(45_100%_45%/0.5)]">
        <Trophy className="h-5 w-5" strokeWidth={2.5} />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-action to-action-dark text-white shadow-[0_3px_8px_-2px_hsl(199_96%_50%/0.5)]">
      <Medal className="h-5 w-5" strokeWidth={2.5} />
    </div>
  );
}

export function LeaderboardBoards({ weekly, allTime, timeLeft }: LeaderboardBoardsProps) {
  const [period, setPeriod] = useState<Period>('week');
  const entries = period === 'week' ? weekly : allTime;
  const scoring = entries.filter((e) => !e.isZero).length;

  return (
    <>
      <div className="mb-4 flex rounded-2xl bg-surface p-1 shadow-card">
        {(
          [
            { key: 'week', label: 'This Week' },
            { key: 'all', label: 'All Time' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            aria-pressed={period === key}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black uppercase tracking-wide transition-colors
              ${period === key ? 'bg-primary text-white' : 'text-text-muted hover:bg-black/5'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mb-5 text-center text-sm text-text-muted">
        {period === 'week' ? (
          <>
            Everyone starts level every Sunday, 5:30 AM IST — <strong className="text-foreground">{timeLeft}</strong>.
          </>
        ) : (
          <>Points earned since you joined. {scoring} of {entries.length} on the board.</>
        )}
      </p>

      {entries.length === 0 ? (
        <div className="shadow-card rounded-2xl bg-surface p-8 text-center text-text-muted">
          No one has signed up yet.
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <li
              key={`${period}-${entry.displayName}-${index}`}
              className={`shadow-card flex items-center gap-4 rounded-2xl bg-surface px-4 py-3 ${entry.isZero ? 'opacity-70' : ''}`}
            >
              <RankBadge rank={index + 1} isZero={entry.isZero} />
              <span className="min-w-0 flex-1 truncate font-black text-foreground">{entry.displayName}</span>

              {entry.streak > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-[#fff4e5] px-2.5 py-1 text-sm font-black text-streak">
                  <Flame className="h-3.5 w-3.5" strokeWidth={2.5} fill="#FF9600" />
                  {entry.streak}
                </span>
              )}

              <span className="whitespace-nowrap font-black tabular-nums text-primary-dark">
                {entry.points}
                <span className="ml-1 text-xs font-bold text-text-muted">pts</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
