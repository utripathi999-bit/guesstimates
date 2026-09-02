import guesstimatesData from '@/data/guesstimates.json';
import type { Guesstimate } from '@/lib/types';

export const guesstimates = guesstimatesData as Guesstimate[];

/** YYYY-MM-DD in the browser's local timezone (not UTC), so the daily set rotates at local midnight. */
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
 * Deterministically picks 2 guesstimates for a given date: one India-region
 * question and one Global-region question, so the split stays consistent
 * with the 80/20 dataset composition every day.
 */
export function getDailyGuesstimates(date: Date = new Date()): [Guesstimate, Guesstimate] {
  const dateStr = getLocalDateString(date);
  const seed = hashString(dateStr);

  const indiaPool = guesstimates.filter((g) => g.region === 'India');
  const globalPool = guesstimates.filter((g) => g.region === 'Global');

  const indiaPick = indiaPool[seed % indiaPool.length];
  const globalPick = globalPool[Math.floor(seed / 7) % globalPool.length];

  return [indiaPick, globalPick];
}

export function getDailyGuesstimateIds(date: Date = new Date()): string[] {
  return getDailyGuesstimates(date).map((g) => g.id);
}

export function getGuesstimateById(id: string): Guesstimate | undefined {
  return guesstimates.find((g) => g.id === id);
}
