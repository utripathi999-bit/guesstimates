import { median, scoreAccuracy, type Accuracy } from '@/lib/estimateMath';
import { getRedis, isRedisConfigured, KEYS } from '@/lib/redis';

/**
 * The committed-estimate store: what each student locked in for a question,
 * and what the batch as a whole guessed.
 *
 * The point of collecting these is the comparison — a student who lands 3x off
 * learns far more from seeing where 40 classmates landed than from a single
 * right answer. That only works if every number is stored against an identity,
 * so one person can't shift the median by submitting repeatedly.
 */

/** Estimates outlive their question's day so the archive keeps working. */
const TTL_SECONDS = 180 * 24 * 60 * 60;

export interface BatchStats {
  /** How many students have committed a number to this question. */
  count: number;
  /** Median of those numbers — null until at least one is in. */
  median: number | null;
}

export interface EstimateOutcome {
  yourValue: number;
  batch: BatchStats;
  /** Absent when the question has no numeric answer to score against. */
  accuracy: Accuracy | null;
  actual: number | null;
}

/** Upstash returns numeric-looking hash values as numbers; never assume string. */
function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export async function getBatchStats(questionId: string): Promise<BatchStats> {
  if (!isRedisConfigured()) return { count: 0, median: null };
  try {
    const raw = await getRedis().hgetall<Record<string, unknown>>(KEYS.questionEstimates(questionId));
    if (!raw) return { count: 0, median: null };
    const values = Object.values(raw).map(toNumber).filter((v) => Number.isFinite(v) && v > 0);
    return { count: values.length, median: median(values) };
  } catch (error) {
    console.error('estimates: batch read failed', questionId, error);
    return { count: 0, median: null };
  }
}

/** The number this student already committed, if any — so it follows them across devices. */
export async function getSubmittedEstimate(
  normalizedEmail: string,
  questionId: string
): Promise<number | null> {
  if (!isRedisConfigured()) return null;
  try {
    const raw = await getRedis().hget<unknown>(KEYS.questionEstimates(questionId), normalizedEmail);
    if (raw === null || raw === undefined) return null;
    const value = toNumber(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch (error) {
    console.error('estimates: read failed', questionId, error);
    return null;
  }
}

/**
 * Records a commitment. Idempotent by design: the first number a student locks
 * in is the one that stands, so nobody can peek at the solution and quietly
 * revise their estimate upward afterwards.
 */
export async function submitEstimate(
  normalizedEmail: string,
  questionId: string,
  value: number,
  actual: number | null
): Promise<EstimateOutcome> {
  const existing = await getSubmittedEstimate(normalizedEmail, questionId);
  const committed = existing ?? value;

  if (existing === null && isRedisConfigured()) {
    try {
      const key = KEYS.questionEstimates(questionId);
      const pipeline = getRedis().pipeline();
      pipeline.hset(key, { [normalizedEmail]: value });
      pipeline.expire(key, TTL_SECONDS);
      await pipeline.exec();
    } catch (error) {
      console.error('estimates: write failed', questionId, error);
    }
  }

  return {
    yourValue: committed,
    batch: await getBatchStats(questionId),
    accuracy: actual !== null ? scoreAccuracy(committed, actual) : null,
    actual,
  };
}
