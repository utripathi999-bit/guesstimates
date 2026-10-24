'use client';

import { Flame, Medal, Trophy } from 'lucide-react';
import { useState } from 'react';
import type { Board } from '@/lib/leaderboard';

type Period = 'week' | 'all';

interface LeaderboardBoardsProps {
  weekly: Board;
  allTime: Board;
  /** Pre-rendered on the server so the two sides never disagree about "now". */
  timeLeft: string;
  boardSize: number;
}

function RankBadge({ rank, isYou }: { rank: number; isYou: boolean }) {
  const medal =
    rank === 1
      ? 'bg-gradient-to-br from-accent to-accent-dark text-white shadow-[0_3px_8px_-2px_hsl(45_100%_45%/0.5)]'
      : rank <= 3
        ? 'bg-gradient-to-br from-action to-action-dark text-white shadow-[0_3px_8px_-2px_hsl(199_96%_50%/0.5)]'
        : null;

  if (medal) {
    return (
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${medal}`}>
        {rank === 1 ? <Trophy className="h-5 w-5" strokeWidth={2.5} /> : <Medal className="h-5 w-5" strokeWidth={2.5} />}
      </div>
    );
  }

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black tabular-nums
        ${isYou ? 'bg-primary text-white' : 'bg-background text-text-muted'}`}
    >
      {rank}
    </div>
  );
}

function Row({ entry, pinned = false }: { entry: Board['top'][number]; pinned?: boolean }) {
  return (
    <li
      className={`shadow-card flex items-center gap-4 rounded-2xl px-4 py-3
        ${entry.isYou ? 'bg-callout-success ring-2 ring-primary' : 'bg-surface'}
        ${pinned ? 'sticky bottom-3' : ''}`}
    >
      <RankBadge rank={entry.rank} isYou={entry.isYou} />
      <span className="min-w-0 flex-1 truncate font-black text-foreground">
        {entry.displayName}
        {entry.isYou && <span className="ml-2 text-xs font-bold uppercase tracking-wide text-primary-dark">You</span>}
      </span>

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
  );
}

export function LeaderboardBoards({ weekly, allTime, timeLeft, boardSize }: LeaderboardBoardsProps) {
  const [period, setPeriod] = useState<Period>('week');
  const board = period === 'week' ? weekly : allTime;

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
          <>Points earned since you joined.</>
        )}
        {board.total > boardSize && (
          <>
            {' '}
            Top {boardSize} of {board.total}.
          </>
        )}
      </p>

      {board.top.length === 0 ? (
        <div className="shadow-card rounded-2xl bg-surface p-8 text-center text-text-muted">
          {period === 'week'
            ? 'Nobody has scored this week yet — solve one and the top spot is yours.'
            : 'No one is on the board yet.'}
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {board.top.map((entry) => (
            <Row key={`${period}-${entry.rank}`} entry={entry} />
          ))}

          {/* Ranked, but below the cut. Pinned so it stays in view while they
              scroll the names above it — the thing a player actually checks. */}
          {board.you && (
            <>
              <li aria-hidden="true" className="py-1 text-center text-lg leading-none tracking-widest text-text-muted">
                ···
              </li>
              <Row entry={board.you} pinned />
            </>
          )}

          {board.youAreUnranked && (
            <li className="shadow-card rounded-2xl bg-surface px-4 py-3 text-center text-sm font-bold text-text-muted">
              {period === 'week'
                ? "You haven't scored this week yet — one guesstimate puts you on the board."
                : 'Solve your first guesstimate to get on the board.'}
            </li>
          )}
        </ol>
      )}
    </>
  );
}
