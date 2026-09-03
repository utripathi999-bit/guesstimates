import { getRedis, isRedisConfigured, KEYS } from '@/lib/redis';

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

const STARTING_FREEZES = 1;

export interface UserProgress {
  points: number;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null;
  completedQuestionIds: string[];
  attemptedQuestionIds: string[];
  dailyCompletionDates: string[];
  freezesAvailable: number;
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
  freezesAvailable: STARTING_FREEZES,
  totalCompleted: 0,
};

/** Days between two YYYY-MM-DD strings (b - a), parsed at UTC noon to sidestep DST edges. */
function daysBetween(a: string, b: string): number {
  const dateA = new Date(`${a}T12:00:00Z`).getTime();
  const dateB = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((dateB - dateA) / (1000 * 60 * 60 * 24));
}

export async function getProgress(normalizedEmail: string): Promise<UserProgress> {
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

/**
 * Records an attempt. Idempotent: attempt points are awarded the first time a
 * given question is opened and never again, so reopening can't farm points.
 */
export async function recordAttempt(normalizedEmail: string, questionId: string): Promise<UserProgress> {
  const progress = await getProgress(normalizedEmail);
  if (progress.attemptedQuestionIds.includes(questionId)) return progress;

  progress.attemptedQuestionIds.push(questionId);
  progress.points += POINTS.ATTEMPT;

  await saveProgress(normalizedEmail, progress);
  return progress;
}

export interface SolveResult {
  progress: UserProgress;
  pointsEarned: number;
  dailyGoalJustCompleted: boolean;
  freezeUsed: boolean;
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
  const progress = await getProgress(normalizedEmail);
  let pointsEarned = 0;

  if (progress.completedQuestionIds.includes(questionId)) {
    return { progress, pointsEarned: 0, dailyGoalJustCompleted: false, freezeUsed: false, counted: false };
  }

  progress.completedQuestionIds.push(questionId);
  progress.totalCompleted += 1;
  pointsEarned += POINTS.SOLVE;

  // Attempt points too, if they somehow solved without an attempt registering.
  if (!progress.attemptedQuestionIds.includes(questionId)) {
    progress.attemptedQuestionIds.push(questionId);
    pointsEarned += POINTS.ATTEMPT;
  }

  let dailyGoalJustCompleted = false;
  let freezeUsed = false;

  const bothTodaysDone =
    todaysIds.length > 0 && todaysIds.every((id) => progress.completedQuestionIds.includes(id));

  if (bothTodaysDone && progress.lastCompletedDate !== todayStr) {
    dailyGoalJustCompleted = true;
    pointsEarned += POINTS.BOTH_IN_A_DAY;
    progress.dailyCompletionDates.push(todayStr);

    if (progress.lastCompletedDate === null) {
      progress.currentStreak = 1;
    } else {
      const gap = daysBetween(progress.lastCompletedDate, todayStr);
      if (gap === 1) {
        progress.currentStreak += 1;
      } else if (gap === 2 && progress.freezesAvailable > 0) {
        // Exactly one day missed — spend a freeze to bridge it.
        progress.freezesAvailable -= 1;
        progress.currentStreak += 1;
        freezeUsed = true;
      } else if (gap > 1) {
        progress.currentStreak = 1;
      }
    }

    // Back-to-back days are worth more, capped so a long streak doesn't make
    // the board unwinnable for someone joining late. A broken streak resets to
    // 1 above, so the bonus restarts small.
    pointsEarned += Math.min(progress.currentStreak, POINTS.MAX_STREAK_MULTIPLIER) * POINTS.PER_STREAK_DAY;
    progress.longestStreak = Math.max(progress.longestStreak, progress.currentStreak);
    progress.lastCompletedDate = todayStr;
  }

  progress.points += pointsEarned;
  await saveProgress(normalizedEmail, progress);

  return { progress, pointsEarned, dailyGoalJustCompleted, freezeUsed, counted: true };
}
