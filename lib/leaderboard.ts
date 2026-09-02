import { getRedis, KEYS } from '@/lib/redis';

export interface LeaderboardEntry {
  userId: string;
  streak: number;
}

/**
 * Atomically updates a user's streak record and their score in the global
 * leaderboard sorted set, so the two never drift out of sync.
 */
export async function recordUserCompletion(userId: string, currentStreak: number): Promise<void> {
  const pipeline = getRedis().pipeline();

  pipeline.hset(KEYS.userStreak(userId), {
    currentStreak,
    lastUpdated: new Date().toISOString(),
  });
  pipeline.zadd(KEYS.leaderboardStreaks, { score: currentStreak, member: userId });

  await pipeline.exec();
}

/**
 * Removes a user's entry from the leaderboard and their streak record —
 * e.g. to clear test/seed data. Admin-only; see the protected DELETE
 * handler in app/api/leaderboard/route.ts.
 */
export async function removeUserFromLeaderboard(userId: string): Promise<void> {
  const pipeline = getRedis().pipeline();
  pipeline.zrem(KEYS.leaderboardStreaks, userId);
  pipeline.del(KEYS.userStreak(userId));
  await pipeline.exec();
}

/**
 * Fetches the top 10 users by streak, highest first.
 */
export async function getTopLeaderboard(): Promise<LeaderboardEntry[]> {
  const raw = await getRedis().zrange(KEYS.leaderboardStreaks, 0, 9, {
    rev: true,
    withScores: true,
  });

  const entries: LeaderboardEntry[] = [];

  // @upstash/redis returns a flat [member, score, member, score, ...] array
  // when withScores is set, rather than an array of paired objects.
  for (let i = 0; i < raw.length; i += 2) {
    const userId = String(raw[i]);
    const streak = Number(raw[i + 1]);
    entries.push({ userId, streak });
  }

  return entries;
}
