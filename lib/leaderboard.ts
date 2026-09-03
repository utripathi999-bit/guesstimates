import { listAllAccounts } from '@/lib/auth';
import { getRedis, isRedisConfigured, KEYS } from '@/lib/redis';

export interface LeaderboardEntry {
  displayName: string;
  points: number;
  streak: number;
  /** True when they haven't scored yet — the board still lists them. */
  isZero: boolean;
}

export async function removeUserFromLeaderboard(normalizedEmail: string): Promise<void> {
  const pipeline = getRedis().pipeline();
  pipeline.zrem(KEYS.leaderboardStreaks, normalizedEmail);
  pipeline.del(KEYS.userStreak(normalizedEmail));
  await pipeline.exec();
}

/**
 * The whole board, ranked by points.
 *
 * Built from the *account list* rather than from the scores, so every student
 * who has signed up appears from the moment they register — a batch board is
 * only useful if the whole batch is on it, including everyone still at zero.
 * Emails are used to join the two, but never returned: viewers see names only.
 */
export async function getFullLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!isRedisConfigured()) return [];

  const accounts = await listAllAccounts();
  if (accounts.length === 0) return [];

  const redis = getRedis();
  const scores = await Promise.all(
    accounts.map(async (account) => {
      try {
        const raw = await redis.hgetall<{ points?: string | number; currentStreak?: string | number }>(
          KEYS.userStreak(account.email)
        );
        return {
          points: Number(raw?.points ?? 0) || 0,
          streak: Number(raw?.currentStreak ?? 0) || 0,
        };
      } catch {
        return { points: 0, streak: 0 };
      }
    })
  );

  return accounts
    .map((account, i) => ({
      // String() again rather than trusting the caller: this sort is the one
      // place a stray non-string took the whole leaderboard down for everyone.
      displayName: String(account.displayName ?? ''),
      points: scores[i].points,
      streak: scores[i].streak,
      isZero: scores[i].points === 0,
    }))
    .sort(
      (a, b) => b.points - a.points || b.streak - a.streak || String(a.displayName).localeCompare(String(b.displayName))
    );
}
