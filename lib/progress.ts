import { getRedis, isRedisConfigured, KEYS } from '@/lib/redis';
import { effectiveStreak } from '@/lib/streakMath';
import { getWeekStart } from '@/lib/week';

export { effectiveStreak } from '@/lib/streakMath';

/**
 * SERVER-AUTHORITATIVE progress and scoring.
 *
 * Progress used to live in localStorage, which made it per-device (solve on a
 * laptop, and your phone showed the question unsolved) and made points
 * client-reported, so a determined student could simply post a bigger number.
 * Both problems have the same root cause and the same fix: the server owns
 * progress. The client reports *actions* — "I attempted X", "I solved X" — and
 * the server decides what, if anything, they are worth.
 */

export const POINTS = {
  /** Opening a question and starting work. Once per question, ever. */
  ATTEMPT: 5,
  /** Marking a single guesstimate solved. */
  SOLVE: 20,
  /** On top of per-question points, for finishing both of a day's questions. */
  BOTH_IN_A_DAY: 30,
  /** Per consecutive day, awarded on daily completion — grows with the streak. */
  PER_STREAK_DAY: 5,
  /** Ceiling on the streak multiplier, so a long streak can't run away with the board. */
  MAX_STREAK_MULTIPLIER: 10,
} as const;

export interface UserProgress {
  points: number;
  currentStreak: number;
  longestStreak: number;
  /** Last day the streak was kept alive — i.e. at least one of that day's questions was solved. */
  lastCompletedDate: string | null;
  completedQuestionIds: string[];
  attemptedQuestionIds: string[];
  /** Days the streak was kept alive (one or both questions). */
  dailyCompletionDates: string[];
  /** Days BOTH questions were finished — tracked separately so the bonus pays once. */
  bothCompletedDates: string[];
  totalCompleted: number;
}

export const EMPTY_PROGRESS: UserProgress = {
  points: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastCompletedDate: null,
  completedQuestionIds: [],
  attemptedQuestionIds: [],
  dailyCompletionDates: [],
  bothCompletedDates: [],
  totalCompleted: 0,
};

/** Exactly what is in storage — for the scoring path, which needs the raw value. */
async function getStoredProgress(normalizedEmail: string): Promise<UserProgress> {
  if (!isRedisConfigured()) return { ...EMPTY_PROGRESS };
  try {
    const raw = await getRedis().get<UserProgress>(KEYS.userProgress(normalizedEmail));
    if (!raw) return { ...EMPTY_PROGRESS };
    return { ...EMPTY_PROGRESS, ...raw };
  } catch (error) {
    console.error('progress: read failed', error);
    return { ...EMPTY_PROGRESS };
  }
}

/**
 * Progress as the student should see it. Every path that hands progress back —
 * reads and writes alike — goes through here, so a lapsed streak cannot escape
 * to the UI or the leaderboard through some path that forgot to decay it.
 */
function asViewed(progress: UserProgress, todayStr: string): UserProgress {
  return {
    ...progress,
    currentStreak: effectiveStreak(progress.currentStreak, progress.lastCompletedDate, todayStr),
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getProgress(
  normalizedEmail: string,
  todayStr: string = today()
): Promise<UserProgress> {
  return asViewed(await getStoredProgress(normalizedEmail), todayStr);
}

async function saveProgress(normalizedEmail: string, progress: UserProgress): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.set(KEYS.userProgress(normalizedEmail), progress);
  // Mirror into the leaderboard structures so ranking stays a cheap read.
  pipeline.hset(KEYS.userStreak(normalizedEmail), {
    points: progress.points,
    currentStreak: progress.currentStreak,
    lastUpdated: new Date().toISOString(),
  });
  pipeline.zadd(KEYS.leaderboardStreaks, { score: progress.points, member: normalizedEmail });
  await pipeline.exec();
}

/** Weekly boards are kept for a season, then expire on their own. */
const WEEKLY_TTL_SECONDS = 120 * 24 * 60 * 60;

/**
 * Mirrors freshly-earned points into the current week's board.
 *
 * Tracked as its own running total rather than derived from lifetime points,
 * because the weekly board has to start everyone at zero each Sunday — a
 * cumulative score can't be un-accumulated. Best-effort: failing to log a
 * weekly point must never cost a student their actual progress.
 */
async function awardWeekly(normalizedEmail: string, points: number, todayStr: string): Promise<void> {
  if (points <= 0 || !isRedisConfigured()) return;
  try {
    const key = KEYS.leaderboardWeekly(getWeekStart(todayStr));
    const pipeline = getRedis().pipeline();
    pipeline.zincrby(key, points, normalizedEmail);
    pipeline.expire(key, WEEKLY_TTL_SECONDS);
    await pipeline.exec();
  } catch (error) {
    console.error('progress: weekly board update failed', error);
  }
}

/**
 * Records an attempt. Idempotent: attempt points are awarded the first time a
 * given question is opened and never again, so reopening can't farm points.
 */
export async function recordAttempt(
  normalizedEmail: string,
  questionId: string,
  todayStr: string
): Promise<UserProgress> {
  const progress = await getStoredProgress(normalizedEmail);
  if (progress.attemptedQuestionIds.includes(questionId)) return asViewed(progress, todayStr);

  progress.attemptedQuestionIds.push(questionId);
  progress.points += POINTS.ATTEMPT;

  await saveProgress(normalizedEmail, progress);
  await awardWeekly(normalizedEmail, POINTS.ATTEMPT, todayStr);
  return asViewed(progress, todayStr);
}

export interface SolveResult {
  progress: UserProgress;
  pointsEarned: number;
  /** The streak advanced — one of today's questions was solved, first time today. */
  streakAdvanced: boolean;
  /** Both of today's questions are now done (earns the extra bonus, once). */
  bothDoneToday: boolean;
  /** False when this question was already solved — nothing was awarded. */
  counted: boolean;
}

/**
 * Records a solve and scores it. All the scoring rules live here rather than
 * in the browser, so the points a student ends up with are the ones the rules
 * produce, not the ones their client claims.
 *
 * `todayStr` and `todaysIds` are supplied by the caller (the API route) from
 * the server's own clock and question store — never from the request body.
 */
export async function recordSolve(
  normalizedEmail: string,
  questionId: string,
  todaysIds: string[],
  todayStr: string
): Promise<SolveResult> {
  const progress = await getStoredProgress(normalizedEmail);
  let pointsEarned = 0;

  if (progress.completedQuestionIds.includes(questionId)) {
    return {
      progress: asViewed(progress, todayStr),
      pointsEarned: 0,
      streakAdvanced: false,
      bothDoneToday: false,
      counted: false,
    };
  }

  progress.completedQuestionIds.push(questionId);
  progress.totalCompleted += 1;
  pointsEarned += POINTS.SOLVE;

  // Attempt points too, if they somehow solved without an attempt registering.
  if (!progress.attemptedQuestionIds.includes(questionId)) {
    progress.attemptedQuestionIds.push(questionId);
    pointsEarned += POINTS.ATTEMPT;
  }

  let streakAdvanced = false;

  const solvedToday = todaysIds.filter((id) => progress.completedQuestionIds.includes(id)).length;
  const solvedAnyToday = solvedToday > 0;
  const bothDoneToday = todaysIds.length > 0 && solvedToday === todaysIds.length;

  // One of the day's questions is enough to keep the streak alive. Doing both
  // is worth more points, but a student who only has time for one shouldn't
  // lose a streak they've been building.
  if (solvedAnyToday && progress.lastCompletedDate !== todayStr) {
    streakAdvanced = true;
    progress.dailyCompletionDates.push(todayStr);

    // Yesterday continues the run; any longer gap starts a new one. Derived
    // from the same rule as effectiveStreak, so what the student was shown
    // before solving and what they get after solving cannot disagree.
    const carried = effectiveStreak(progress.currentStreak, progress.lastCompletedDate, todayStr);
    progress.currentStreak = carried + 1;

    // Back-to-back days are worth more, capped so a long streak doesn't make
    // the board unwinnable for someone joining late. A broken streak resets to
    // 1 above, so the bonus restarts small.
    pointsEarned += Math.min(progress.currentStreak, POINTS.MAX_STREAK_MULTIPLIER) * POINTS.PER_STREAK_DAY;
    progress.longestStreak = Math.max(progress.longestStreak, progress.currentStreak);
    progress.lastCompletedDate = todayStr;
  }

  // Finishing both is a separate, additional reward — tracked on its own dates
  // list so it pays exactly once per day regardless of solve order.
  if (bothDoneToday && !progress.bothCompletedDates.includes(todayStr)) {
    progress.bothCompletedDates.push(todayStr);
    pointsEarned += POINTS.BOTH_IN_A_DAY;
  }

  progress.points += pointsEarned;
  await saveProgress(normalizedEmail, progress);
  await awardWeekly(normalizedEmail, pointsEarned, todayStr);

  return { progress: asViewed(progress, todayStr), pointsEarned, streakAdvanced, bothDoneToday, counted: true };
}
