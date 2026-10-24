import { Settings } from 'lucide-react';
import { LeaderboardBoards } from '@/components/LeaderboardBoards';
import { getSessionAccountFromCookies } from '@/lib/auth';
import { BOARD_SIZE, getAllTimeBoard, getWeeklyBoard } from '@/lib/leaderboard';
import { isRedisConfigured } from '@/lib/redis';
import { describeTimeLeft } from '@/lib/week';

export const dynamic = 'force-dynamic';

const EMPTY = { top: [], you: null, youAreUnranked: false, total: 0 };

export default async function LeaderboardPage() {
  const redisReady = isRedisConfigured();

  // The viewer's own email never reaches the browser — it is used only to find
  // their rank and to mark their row.
  const account = redisReady ? await getSessionAccountFromCookies() : null;
  const viewer = account?.email ?? null;

  const [allTime, weekly] = redisReady
    ? await Promise.all([getAllTimeBoard(viewer), getWeeklyBoard(viewer)])
    : [EMPTY, { ...EMPTY, weekStart: '', resetAt: new Date().toISOString() }];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-6 text-center">
        <p className="text-xs font-black uppercase tracking-wider text-accent-dark">The Batch</p>
        <h1 className="text-display text-3xl font-black text-foreground">Leaderboard</h1>
      </div>

      {!redisReady ? (
        <div className="shadow-card flex flex-col items-center gap-2 rounded-2xl bg-surface p-8 text-center text-text-muted">
          <Settings className="h-6 w-6" strokeWidth={2.5} />
          <p className="font-bold text-foreground">Leaderboard isn&apos;t set up yet</p>
          <p className="text-sm">
            Add <code className="rounded bg-background px-1.5 py-0.5">UPSTASH_REDIS_REST_URL</code> and{' '}
            <code className="rounded bg-background px-1.5 py-0.5">UPSTASH_REDIS_REST_TOKEN</code> to enable it.
          </p>
        </div>
      ) : (
        <LeaderboardBoards
          weekly={weekly}
          allTime={allTime}
          boardSize={BOARD_SIZE}
          // Rendered server-side and passed down, so the client never recomputes
          // "now" and disagrees with the server during hydration.
          timeLeft={describeTimeLeft(new Date(weekly.resetAt))}
        />
      )}
    </main>
  );
}
