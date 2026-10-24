import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { getRedis, isRedisConfigured, KEYS } from '@/lib/redis';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/sessionCookie';

// Re-exported so existing callers can keep importing them from here; the
// definitions live in the Edge-safe module the proxy imports.
export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };

const BCRYPT_ROUNDS = 10;

export interface Account {
  email: string;
  displayName: string;
  createdAt: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Upstash deserializes hash values, so an all-numeric string written as a
 * display name ("1234567") comes back as the NUMBER 1234567. Anything that
 * then treats it as a string — localeCompare, slice — throws. Coerce at the
 * read boundary so the rest of the app can rely on these being strings.
 */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export async function getAccountByEmail(
  normalizedEmail: string
): Promise<(Account & { passwordHash: string }) | null> {
  const raw = await getRedis().hgetall<Record<string, unknown>>(KEYS.account(normalizedEmail));
  // Keyed on email, not on the password hash: an account created through Google
  // has no hash, and treating that as "no account" would make the whole app
  // fail to find a perfectly valid user.
  if (!raw || !raw.email) return null;
  return {
    email: asString(raw.email),
    displayName: asString(raw.displayName),
    passwordHash: asString(raw.passwordHash),
    createdAt: asString(raw.createdAt),
  };
}

/**
 * Accounts are capped so a public link can't run the bills past what this is
 * worth. 100 is the batch plus room for the people they share it with; the
 * binding constraints behind it are the Gemini and Redis free tiers.
 */
export const MAX_ACCOUNTS = 100;

/** How many accounts exist, for the signup cap and the admin view. */
export async function getAccountCount(): Promise<number> {
  if (!isRedisConfigured()) return 0;
  const redis = getRedis();
  const current = await redis.get<number>(KEYS.accountCount);
  if (current !== null && current !== undefined) return Number(current) || 0;

  // First read since the counter was introduced — seed it from the accounts
  // that already exist. NX so two simultaneous signups can't both seed it.
  const existing = (await listAllAccounts()).length;
  await redis.set(KEYS.accountCount, existing, { nx: true });
  return Number(await redis.get<number>(KEYS.accountCount)) || existing;
}

/**
 * Claims one of the available places, or returns false when full.
 *
 * Increment-then-check rather than check-then-increment: two signups arriving
 * together would both pass a check, and the cap would quietly be 101. INCR is
 * atomic, so the loser of that race sees the over-limit value and gives its
 * place back.
 */
export async function reserveAccountSlot(): Promise<boolean> {
  if (!isRedisConfigured()) return true;
  await getAccountCount();

  const next = await getRedis().incr(KEYS.accountCount);
  if (next > MAX_ACCOUNTS) {
    await getRedis().decr(KEYS.accountCount);
    return false;
  }
  return true;
}

/** Hands a reserved place back when the signup it was claimed for then failed. */
export async function releaseAccountSlot(): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    await getRedis().decr(KEYS.accountCount);
  } catch (error) {
    console.error('auth: could not release account slot', error);
  }
}

/**
 * Creates an account. `password` is null for Google sign-in, which leaves the
 * hash empty — the login route refuses those explicitly rather than relying on
 * a bcrypt comparison against an empty string happening to fail.
 */
export async function createAccount(
  email: string,
  password: string | null,
  displayName: string,
  provider: 'password' | 'google' = 'password'
): Promise<Account> {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = password === null ? '' : await hashPassword(password);
  const createdAt = new Date().toISOString();

  await getRedis().hset(KEYS.account(normalizedEmail), {
    email: normalizedEmail,
    displayName,
    passwordHash,
    provider,
    createdAt,
  });

  return { email: normalizedEmail, displayName, createdAt };
}

/** Creates a new session for an account and returns the raw token to set as a cookie. */
export async function createSession(normalizedEmail: string): Promise<string> {
  const token = generateSessionToken();
  await getRedis().set(KEYS.session(token), normalizedEmail, { ex: SESSION_MAX_AGE_SECONDS });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await getRedis().del(KEYS.session(token));
}

async function resolveSessionToken(token: string | undefined): Promise<Account | null> {
  if (!token) return null;

  const redis = getRedis();
  const normalizedEmail = await redis.get<string>(KEYS.session(token));
  if (!normalizedEmail) return null;

  const account = await getAccountByEmail(normalizedEmail);
  if (!account) return null;

  await redis.expire(KEYS.session(token), SESSION_MAX_AGE_SECONDS);

  return { email: account.email, displayName: account.displayName, createdAt: account.createdAt };
}

/**
 * Resolves the current request's session (if any) to the account it belongs
 * to, and slides the session's expiry forward — so an active visitor stays
 * logged in indefinitely without the cookie itself ever needing to change.
 */
export async function getSessionAccount(request: NextRequest): Promise<Account | null> {
  return resolveSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

/** Same, for Server Components / pages, which read cookies via next/headers rather than a request object. */
export async function getSessionAccountFromCookies(): Promise<Account | null> {
  const cookieStore = await cookies();
  return resolveSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export interface AccountSummary {
  email: string;
  displayName: string;
  createdAt: string;
}

/**
 * Every registered account, for the owner-only admin view. Uses SCAN over the
 * account key prefix rather than maintaining a separate index — no index to
 * keep in sync, and it picks up accounts created before this existed. Fine at
 * this scale; would want a real index if the user count ever got large.
 */
export async function listAllAccounts(): Promise<AccountSummary[]> {
  if (!isRedisConfigured()) return [];
  const redis = getRedis();

  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: KEYS.account('*'), count: 200 });
    keys.push(...batch);
    cursor = String(nextCursor);
  } while (cursor !== '0');

  const accounts = await Promise.all(
    keys.map(async (key) => {
      const raw = await redis.hgetall<Record<string, unknown>>(key);
      if (!raw?.email) return null;
      // Coerced for the same reason as above — a numeric-looking display name
      // comes back as a number and breaks every string operation downstream.
      return {
        email: asString(raw.email),
        displayName: asString(raw.displayName),
        createdAt: asString(raw.createdAt),
      };
    })
  );

  return accounts
    .filter((a): a is AccountSummary => a !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Fully removes an account: credentials, progress, and every leaderboard
 * trace. Any live session for it stops resolving (getSessionAccount returns
 * null once the account record is gone), so the user is effectively signed out.
 */
export async function deleteAccount(normalizedEmail: string): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.del(KEYS.account(normalizedEmail));
  pipeline.del(KEYS.userProgress(normalizedEmail));
  pipeline.del(KEYS.userStreak(normalizedEmail));
  pipeline.zrem(KEYS.leaderboardStreaks, normalizedEmail);
  // Give the place back, or deleting accounts would slowly use up the cap.
  pipeline.decr(KEYS.accountCount);
  await pipeline.exec();
}

/** The single account allowed to see the admin view, configured via env. */
export function isOwner(account: Account | null): boolean {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail || !account) return false;
  return normalizeEmail(ownerEmail) === account.email;
}
