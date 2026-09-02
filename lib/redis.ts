import { Redis } from '@upstash/redis';

let cachedClient: Redis | null = null;

/**
 * Lazily constructs the Upstash Redis client on first use. Deliberately does
 * NOT read env vars at module scope — Next.js evaluates route/page modules
 * during build-time page-data collection, which would otherwise throw when
 * UPSTASH_REDIS_REST_URL/TOKEN aren't set in the build environment.
 */
export function isRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function getRedis(): Redis {
  if (cachedClient) return cachedClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Missing Upstash Redis environment variables: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set.'
    );
  }

  cachedClient = new Redis({ url, token });
  return cachedClient;
}

/**
 * Centralized Redis key schema. All call sites should build keys through
 * these helpers rather than hand-writing key strings, to keep the schema
 * consistent and easy to change in one place.
 */
export const KEYS = {
  /** Hash/JSON payload of that day's generated guesstimates. e.g. guesstimates:daily:2026-08-31 */
  dailyQuestions: (date: string): string => `guesstimates:daily:${date}`,

  /** List of all guesstimate ids ever generated, newest first. */
  archive: 'guesstimates:archive' as const,

  /** Hash of a single user's streak state. e.g. user:abc123:streak */
  userStreak: (userId: string): string => `user:${userId}:streak`,

  /** Sorted set: member = userId, score = currentStreak. */
  leaderboardStreaks: 'leaderboard:streaks' as const,
} as const;

export type RedisKeys = typeof KEYS;
