import { Ratelimit } from '@upstash/ratelimit';
import { NextRequest } from 'next/server';
import { getRedis, isRedisConfigured } from '@/lib/redis';

let limiter: Ratelimit | null = null;

/**
 * One shared limiter across all AI-backed routes (hint/feedback/clarify),
 * keyed by client IP — a single bucket per visitor rather than one per
 * route, so spreading requests across endpoints doesn't bypass it. These
 * routes are public and unauthenticated, and each call costs a real Gemini
 * API request, so this exists to cap abuse/cost, not to police legitimate
 * use — the limit is generous for a normal practice session.
 */
function getLimiter(): Ratelimit {
  if (limiter) return limiter;
  limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(30, '1 h'),
    prefix: 'ratelimit:ai',
    analytics: true,
  });
  return limiter;
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
}

/**
 * Fails OPEN (allows the request) if Redis isn't configured, rather than
 * blocking every AI request when rate-limit state has nowhere to live —
 * these routes already no-op without GEMINI_API_KEY regardless, and local
 * dev without Redis shouldn't lose the AI features entirely.
 */
export async function checkAiRateLimit(request: NextRequest): Promise<RateLimitResult> {
  if (!isRedisConfigured()) {
    return { allowed: true, remaining: Infinity, resetAt: 0 };
  }
  const ip = getClientIp(request);
  const { success, remaining, reset } = await getLimiter().limit(ip);
  return { allowed: success, remaining, resetAt: reset };
}

export function rateLimitResponseHeaders(result: RateLimitResult): HeadersInit {
  const retryAfterSeconds = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));
  return { 'Retry-After': String(retryAfterSeconds) };
}
