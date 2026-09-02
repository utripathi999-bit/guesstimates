import { Flame, Medal, Settings, Trophy } from 'lucide-react';
import { getTopLeaderboard } from '@/lib/leaderboard';
import { isRedisConfigured } from '@/lib/redis';

export const dynamic = 'force-dynamic';

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-dark text-white shadow-[0_3px_8px_-2px_hsl(45_100%_45%/0.5)]">
        <Trophy className="h-5 w-5" strokeWidth={2.5} />
      </div>
    );
  }
  if (rank === 2 || rank === 3) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-action to-action-dark text-white shadow-[0_3px_8px_-2px_hsl(199_96%_50%/0.5)]">
        <Medal className="h-5 w-5" strokeWidth={2.5} />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background font-black text-text-muted">
      {rank}
    </div>
  );
}

export default async function LeaderboardPage() {
  const redisReady = isRedisConfigured();
  const entries = redisReady ? await getTopLeaderboard() : [];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs font-black uppercase tracking-wider text-accent-dark">Top Players</p>
        <h1 className="text-display text-3xl font-black text-foreground">Streak Leaderboard</h1>
        <p className="mt-1 text-text-muted">Top 10 GuesstimateDaily streaks, right now.</p>
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
      ) : entries.length === 0 ? (
        <div className="shadow-card rounded-2xl bg-surface p-8 text-center text-text-muted">
          No streaks recorded yet. Sign in and be the first to show up on the board.
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <li key={`${entry.displayName}-${index}`} className="shadow-card flex items-center gap-4 rounded-2xl bg-surface px-4 py-3">
              <RankBadge rank={index + 1} />
              <span className="flex-1 truncate font-black text-foreground">{entry.displayName}</span>
              <span className="flex items-center gap-1 rounded-full bg-[#fff4e5] px-3 py-1 font-black text-streak">
                <Flame className="h-4 w-4" strokeWidth={2.5} fill="#FF9600" />
                {entry.streak}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
