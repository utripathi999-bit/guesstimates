import { getAccountByEmail } from '@/lib/auth';
import { getProgress } from '@/lib/progress';
import { getRedis, isRedisConfigured, KEYS } from '@/lib/redis';
import { getUtcDateString } from '@/lib/questionStore';
import { getWeekResetAt, getWeekStart } from '@/lib/week';

/**
 * Leaderboards, read from the sorted sets rather than from the account list.
 *
 * The previous version listed every account and then read every account's
 * progress — twice per page view, once per board. That is fine for one batch
 * and ruinous beyond it: at 500 students a single view cost roughly two
 * thousand Redis commands, against a free-tier allowance of 500,000 a month.
 * Reading the top of a sorted set instead costs the same whether there are
 * fifty people or fifty thousand.
 *
 * The visible change that makes this possible is showing a top 20 and the
 * viewer's own rank, rather than listing everyone — which is also what a
 * leaderboard should do once it stops being one classroom.
 */

/** How many places are listed before the viewer's own row. */
export const BOARD_SIZE = 20;

export interface BoardEntry {
  rank: number;
  displayName: string;
  points: number;
  streak: number;
  isYou: boolean;
}

export interface Board {
  top: BoardEntry[];
  /**
   * The viewer's own row, when they aren't already in the top. Null when they
   * are in the list above, or have no points yet and so no rank at all.
   */
  you: BoardEntry | null;
  /** Whether the viewer has scored but sits outside the top. */
  youAreUnranked: boolean;
  /** How many people have scored on this board. */
  total: number;
}

export interface WeeklyBoard extends Board {
  weekStart: string;
  resetAt: string;
}

export async function removeUserFromLeaderboard(normalizedEmail: string): Promise<void> {
  const pipeline = getRedis().pipeline();
  pipeline.zrem(KEYS.leaderboardStreaks, normalizedEmail);
  // The current week too, or a removed account keeps its place there until Sunday.
  pipeline.zrem(KEYS.leaderboardWeekly(getWeekStart(getUtcDateString())), normalizedEmail);
  pipeline.del(KEYS.userStreak(normalizedEmail));
  await pipeline.exec();
}

/** Upstash returns withScores as a flat [member, score, member, score, …]. */
function pairUp(flat: (string | number)[]): { email: string; score: number }[] {
  return Array.from({ length: Math.floor(flat.length / 2) }, (_, i) => ({
    email: String(flat[i * 2]),
    score: Number(flat[i * 2 + 1]) || 0,
  }));
}

/**
 * Name and live streak for one person on the board.
 *
 * The streak comes from the progress record rather than the mirrored hash,
 * because the mirror holds the number without the date it was earned and so
 * can't tell a live streak from an abandoned one. Only ever called for the
 * handful of rows actually displayed.
 */
async function decorate(email: string, todayStr: string): Promise<{ displayName: string; streak: number }> {
  try {
    const [account, progress] = await Promise.all([getAccountByEmail(email), getProgress(email, todayStr)]);
    return {
      displayName: String(account?.displayName ?? '').trim() || 'Someone',
      streak: Number(progress.currentStreak) || 0,
    };
  } catch {
    return { displayName: 'Someone', streak: 0 };
  }
}

async function buildBoard(key: string, viewerEmail: string | null, todayStr: string): Promise<Board> {
  if (!isRedisConfigured()) {
    return { top: [], you: null, youAreUnranked: false, total: 0 };
  }

  const redis = getRedis();
  let flat: (string | number)[] = [];
  let total = 0;

  try {
    [flat, total] = await Promise.all([
      redis.zrange<(string | number)[]>(key, 0, BOARD_SIZE - 1, { rev: true, withScores: true }),
      redis.zcard(key),
    ]);
  } catch (error) {
    console.error('leaderboard: could not read', key, error);
    return { top: [], you: null, youAreUnranked: false, total: 0 };
  }

  const ranked = pairUp(flat);
  const decorated = await Promise.all(ranked.map((r) => decorate(r.email, todayStr)));

  const top: BoardEntry[] = ranked.map((r, i) => ({
    rank: i + 1,
    displayName: decorated[i].displayName,
    points: r.score,
    streak: decorated[i].streak,
    isYou: viewerEmail !== null && r.email === viewerEmail,
  }));

  if (!viewerEmail || top.some((e) => e.isYou)) {
    return { top, you: null, youAreUnranked: false, total };
  }

  // Outside the top: two cheap lookups rather than ranking the whole set.
  try {
    const [rank, score] = await Promise.all([
      redis.zrevrank(key, viewerEmail),
      redis.zscore(key, viewerEmail),
    ]);

    if (rank === null || rank === undefined || score === null || score === undefined) {
      return { top, you: null, youAreUnranked: true, total };
    }

    const mine = await decorate(viewerEmail, todayStr);
    return {
      top,
      you: { rank: Number(rank) + 1, displayName: mine.displayName, points: Number(score) || 0, streak: mine.streak, isYou: true },
      youAreUnranked: false,
      total,
    };
  } catch (error) {
    console.error('leaderboard: could not read own rank', error);
    return { top, you: null, youAreUnranked: true, total };
  }
}

/** All-time points. */
export async function getAllTimeBoard(viewerEmail: string | null, now: Date = new Date()): Promise<Board> {
  return buildBoard(KEYS.leaderboardStreaks, viewerEmail, getUtcDateString(now));
}

/**
 * This week's board, which empties every Sunday at 05:30 IST.
 *
 * The reset is what makes it worth checking: on a lifetime total, whoever
 * started first and never missed is permanently top, and everyone else stops
 * looking. A weekly period gives someone who joined yesterday a winnable race.
 */
export async function getWeeklyBoard(viewerEmail: string | null, now: Date = new Date()): Promise<WeeklyBoard> {
  const today = getUtcDateString(now);
  const weekStart = getWeekStart(today);
  const board = await buildBoard(KEYS.leaderboardWeekly(weekStart), viewerEmail, today);
  return { ...board, weekStart, resetAt: getWeekResetAt(today).toISOString() };
}
