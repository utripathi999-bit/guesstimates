import { Flame, Medal, Settings, Trophy } from 'lucide-react';
import { getFullLeaderboard } from '@/lib/leaderboard';
import { isRedisConfigured } from '@/lib/redis';

export const dynamic = 'force-dynamic';

function RankBadge({ rank, isZero }: { rank: number; isZero: boolean }) {
  if (isZero) {
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
  if (rank === 2 || rank === 3) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-action to-action-dark text-white shadow-[0_3px_8px_-2px_hsl(199_96%_50%/0.5)]">
        <Medal className="h-5 w-5" strokeWidth={2.5} />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background font-black text-text-muted">
      {rank}
    </div>
  );
}

export default async function LeaderboardPage() {
  const redisReady = isRedisConfigured();
  const entries = redisReady ? await getFullLeaderboard() : [];
  const scoring = entries.filter((e) => !e.isZero).length;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs font-black uppercase tracking-wider text-accent-dark">The Batch</p>
        <h1 className="text-display text-3xl font-black text-foreground">Leaderboard</h1>
        <p className="mt-1 text-text-muted">
          {entries.length} {entries.length === 1 ? 'student' : 'students'} signed up
          {scoring > 0 ? `, ${scoring} on the board` : ''}. Ranked by points.
        </p>
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
          No one has signed up yet.
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <li
              key={`${entry.displayName}-${index}`}
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
    </main>
  );
}
