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
 * Fallback pair for a given date, used when no AI-generated set exists for it:
 * one India-region question and one Global, deterministic so the same date
 * always yields the same pair.
 */
export function pickDeterministicPair(dateStr: string): [Guesstimate, Guesstimate] {
  const seed = hashString(dateStr);

  const indiaPool = guesstimates.filter((g) => g.region === 'India');
  const globalPool = guesstimates.filter((g) => g.region === 'Global');

  return [indiaPool[seed % indiaPool.length], globalPool[Math.floor(seed / 7) % globalPool.length]];
}

/** Static-only lookup. Prefer questionStore.getQuestionById, which also resolves AI-generated questions. */
export function getStaticQuestionById(id: string): Guesstimate | undefined {
  return guesstimates.find((g) => g.id === id);
}
