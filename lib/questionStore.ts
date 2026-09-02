import { guesstimates as staticQuestions, pickDeterministicPair } from '@/lib/dailyPicker';
import { GuesstimateZ } from '@/lib/guesstimateSchema';
import { getRedis, isRedisConfigured, KEYS } from '@/lib/redis';
import type { Guesstimate } from '@/lib/types';

/**
 * SERVER-ONLY. Resolves guesstimates from both sources: the static seed set
 * bundled with the app, and the AI-generated ones the nightly cron writes to
 * Redis. Everything that needs a question — the daily pair, the detail page,
 * and all the AI routes — goes through here, so an AI-generated question is a
 * first-class question everywhere instead of only existing in the cron's output.
 *
 * Redis is treated as untrusted on read (it holds model output): every payload
 * is validated against the schema before use, and anything malformed is ignored
 * in favour of the static fallback rather than crashing a page.
 */

/** UTC, matching the cron's own date basis so the key written is the key read. */
export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface DailyPair {
  questions: [Guesstimate, Guesstimate];
  date: string;
  /** Where the pair came from — surfaced so the UI can show whether today's set is freshly generated. */
  source: 'ai' | 'static';
}

async function readAiQuestion(id: string): Promise<Guesstimate | undefined> {
  if (!isRedisConfigured()) return undefined;
  try {
    const raw = await getRedis().get<unknown>(KEYS.question(id));
    if (!raw) return undefined;
    const parsed = GuesstimateZ.safeParse(raw);
    return parsed.success ? (parsed.data as Guesstimate) : undefined;
  } catch (error) {
    console.error('questionStore: failed reading AI question', id, error);
    return undefined;
  }
}

export async function getQuestionById(id: string): Promise<Guesstimate | undefined> {
  const fromStatic = staticQuestions.find((q) => q.id === id);
  if (fromStatic) return fromStatic;
  return readAiQuestion(id);
}

export async function getDailyPair(date: Date = new Date()): Promise<DailyPair> {
  const dateStr = getUtcDateString(date);
  const fallback: DailyPair = {
    questions: pickDeterministicPair(dateStr),
    date: dateStr,
    source: 'static',
  };

  if (!isRedisConfigured()) return fallback;

  try {
    const raw = await getRedis().get<unknown>(KEYS.dailyQuestions(dateStr));
    if (!Array.isArray(raw) || raw.length !== 2) return fallback;

    const parsed = raw.map((item) => GuesstimateZ.safeParse(item));
    if (!parsed.every((p) => p.success)) {
      console.error('questionStore: daily pair failed validation, using static fallback');
      return fallback;
    }

    const questions = parsed.map((p) => p.data as Guesstimate) as [Guesstimate, Guesstimate];
    return { questions, date: dateStr, source: 'ai' };
  } catch (error) {
    console.error('questionStore: failed reading daily pair', error);
    return fallback;
  }
}
