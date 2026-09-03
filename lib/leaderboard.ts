import { listAllAccounts } from '@/lib/auth';
import { getRedis, isRedisConfigured, KEYS } from '@/lib/redis';
import { getUtcDateString } from '@/lib/questionStore';
import { getWeekResetAt, getWeekStart } from '@/lib/week';

export interface LeaderboardEntry {
  displayName: string;
  points: number;
  streak: number;
  /** True when they haven't scored yet — the board still lists them. */
  isZero: boolean;
}

export interface WeeklyBoard {
  entries: LeaderboardEntry[];
  /** The Sunday this week's board opened, YYYY-MM-DD. */
  weekStart: string;
  /** When it wipes and everyone starts level again. */
  resetAt: string;
}

export async function removeUserFromLeaderboard(normalizedEmail: string): Promise<void> {
  const pipeline = getRedis().pipeline();
  pipeline.zrem(KEYS.leaderboardStreaks, normalizedEmail);
  pipeline.del(KEYS.userStreak(normalizedEmail));
  await pipeline.exec();
}

/** Live streak + lifetime points for one account, defaulting to zero on any read trouble. */
async function readStreakHash(normalizedEmail: string): Promise<{ points: number; streak: number }> {
  try {
    const raw = await getRedis().hgetall<{ points?: string | number; currentStreak?: string | number }>(
      KEYS.userStreak(normalizedEmail)
    );
    return {
      points: Number(raw?.points ?? 0) || 0,
      streak: Number(raw?.currentStreak ?? 0) || 0,
    };
  } catch {
    return { points: 0, streak: 0 };
  }
}

/**
 * Ranks entries highest-first, breaking ties on streak then name.
 *
 * String() rather than trusting the stored value: a display name that happened
 * to be all digits came back from Redis as a number once and took the whole
 * board down on localeCompare.
 */
function rank(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries.sort(
    (a, b) => b.points - a.points || b.streak - a.streak || String(a.displayName).localeCompare(String(b.displayName))
  );
}

/**
 * The all-time board.
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

  const scores = await Promise.all(accounts.map((account) => readStreakHash(account.email)));

  return rank(
    accounts.map((account, i) => ({
      displayName: String(account.displayName ?? ''),
      points: scores[i].points,
      streak: scores[i].streak,
      isZero: scores[i].points === 0,
    }))
  );
}

/**
 * This week's board, which empties every Sunday at 5:30 AM IST.
 *
 * The reset is what makes the board worth checking: on a lifetime total,
 * whoever started first and never missed a day is permanently top, and everyone
 * else stops looking by week three. A weekly period gives all 60 students a
 * winnable race every seven days, and someone who joins late is only ever a few
 * days behind rather than a term behind.
 */
export async function getWeeklyLeaderboard(now: Date = new Date()): Promise<WeeklyBoard> {
  const today = getUtcDateString(now);
  const weekStart = getWeekStart(today);
  const meta = { weekStart, resetAt: getWeekResetAt(today).toISOString() };

  if (!isRedisConfigured()) return { entries: [], ...meta };

  const accounts = await listAllAccounts();
  if (accounts.length === 0) return { entries: [], ...meta };

  let weeklyPoints = new Map<string, number>();
  try {
    // One range read for the whole week rather than a score lookup per student.
    const flat = await getRedis().zrange<(string | number)[]>(KEYS.leaderboardWeekly(weekStart), 0, -1, {
      withScores: true,
    });
    weeklyPoints = new Map(
      Array.from({ length: Math.floor(flat.length / 2) }, (_, i) => [
        String(flat[i * 2]),
        Number(flat[i * 2 + 1]) || 0,
      ])
    );
  } catch (error) {
    console.error('leaderboard: weekly read failed', error);
  }

  const streaks = await Promise.all(accounts.map((account) => readStreakHash(account.email)));

  const entries = rank(
    accounts.map((account, i) => {
      const points = weeklyPoints.get(account.email) ?? 0;
      return {
        displayName: String(account.displayName ?? ''),
        points,
        streak: streaks[i].streak,
        isZero: points === 0,
      };
    })
  );

  return { entries, ...meta };
}
