import guesstimatesData from '@/data/guesstimates.json';
import type { Guesstimate } from '@/lib/types';

/** The static seed set. AI-generated questions live in Redis — see lib/questionStore.ts. */
export const guesstimates = guesstimatesData as Guesstimate[];

/** YYYY-MM-DD in the browser's local timezone. Used for streak bookkeeping (when *you* completed something). */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Simple deterministic string hash (djb2) so the same date always maps to the same index. */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * How often a Global question appears at all. Two questions a day, one Global
 * every 10th day, works out to ~5% of everything served — the rest is India
 * context, which is what the audience is actually preparing for.
 */
export const GLOBAL_QUESTION_DAY_INTERVAL = 10;

/**
 * Deterministic (not random) so the schedule is predictable and testable, and
 * so the AI generator and the static fallback always agree on whether a given
 * day is a Global day.
 */
export function isGlobalQuestionDay(dateStr: string): boolean {
  const daysSinceEpoch = Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 86_400_000);
  return daysSinceEpoch % GLOBAL_QUESTION_DAY_INTERVAL === 0;
}

/**
 * Fallback pair for a given date, used when no AI-generated set exists for it.
 * Deterministic, so the same date always yields the same pair. Normally two
 * India questions; one of them is Global only on a Global day.
 */
export function pickDeterministicPair(dateStr: string): [Guesstimate, Guesstimate] {
  const seed = hashString(dateStr);

  const indiaPool = guesstimates.filter((g) => g.region === 'India');
  const globalPool = guesstimates.filter((g) => g.region === 'Global');

  const firstIndia = indiaPool[seed % indiaPool.length];

  if (isGlobalQuestionDay(dateStr) && globalPool.length > 0) {
    return [firstIndia, globalPool[Math.floor(seed / 7) % globalPool.length]];
  }

  // Two India questions — offset by a coprime stride so the second is never the first.
  const secondIndex = (seed % indiaPool.length + 1 + (Math.floor(seed / 7) % (indiaPool.length - 1))) % indiaPool.length;
  return [firstIndia, indiaPool[secondIndex]];
}

/** Static-only lookup. Prefer questionStore.getQuestionById, which also resolves AI-generated questions. */
export function getStaticQuestionById(id: string): Guesstimate | undefined {
  return guesstimates.find((g) => g.id === id);
}
