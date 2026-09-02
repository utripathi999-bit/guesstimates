import { getAccountByEmail } from '@/lib/auth';
import { getRedis, KEYS } from '@/lib/redis';

export interface LeaderboardEntry {
  displayName: string;
  streak: number;
}

/**
 * Atomically updates an account's streak record and its score in the global
 * leaderboard sorted set, so the two never drift out of sync. Keyed by
 * normalized email (unique, never shown to viewers) rather than display
 * name, since two accounts can share a display name.
 */
export async function recordUserCompletion(normalizedEmail: string, currentStreak: number): Promise<void> {
  const pipeline = getRedis().pipeline();

  pipeline.hset(KEYS.userStreak(normalizedEmail), {
    currentStreak,
    lastUpdated: new Date().toISOString(),
  });
  pipeline.zadd(KEYS.leaderboardStreaks, { score: currentStreak, member: normalizedEmail });

  await pipeline.exec();
}

/**
 * Removes an account's entry from the leaderboard and its streak record —
 * e.g. to clear test/seed data. Admin-only; see the protected DELETE
 * handler in app/api/leaderboard/route.ts.
 */
export async function removeUserFromLeaderboard(normalizedEmail: string): Promise<void> {
  const pipeline = getRedis().pipeline();
  pipeline.zrem(KEYS.leaderboardStreaks, normalizedEmail);
  pipeline.del(KEYS.userStreak(normalizedEmail));
  await pipeline.exec();
}

/**
 * Fetches the top 10 accounts by streak, highest first. Resolves each
 * member (an email) to its current display name — emails themselves are
 * never returned, since they must not be visible to other viewers.
 */
export async function getTopLeaderboard(): Promise<LeaderboardEntry[]> {
  const raw = await getRedis().zrange(KEYS.leaderboardStreaks, 0, 9, {
    rev: true,
    withScores: true,
  });

  const ranked: { email: string; streak: number }[] = [];
  // @upstash/redis returns a flat [member, score, member, score, ...] array
  // when withScores is set, rather than an array of paired objects.
  for (let i = 0; i < raw.length; i += 2) {
    ranked.push({ email: String(raw[i]), streak: Number(raw[i + 1]) });
  }

  const entries = await Promise.all(
    ranked.map(async ({ email, streak }) => {
      const account = await getAccountByEmail(email);
      return { displayName: account?.displayName ?? 'Former Player', streak };
    })
  );

  return entries;
}
