import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { getRedis, KEYS } from '@/lib/redis';

export const SESSION_COOKIE_NAME = 'gd_session';
/** Browsers cap cookie lifetime at ~400 days regardless of what's requested — there's no true "forever" cookie. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

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

export async function getAccountByEmail(
  normalizedEmail: string
): Promise<(Account & { passwordHash: string }) | null> {
  const raw = await getRedis().hgetall<{ email: string; displayName: string; passwordHash: string; createdAt: string }>(
    KEYS.account(normalizedEmail)
  );
  if (!raw || !raw.passwordHash) return null;
  return raw;
}

export async function createAccount(email: string, password: string, displayName: string): Promise<Account> {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await hashPassword(password);
  const createdAt = new Date().toISOString();

  await getRedis().hset(KEYS.account(normalizedEmail), {
    email: normalizedEmail,
    displayName,
    passwordHash,
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

/**
 * Resolves the current request's session (if any) to the account it belongs
 * to, and slides the session's expiry forward — so an active visitor stays
 * logged in indefinitely without the cookie itself ever needing to change.
 */
export async function getSessionAccount(request: NextRequest): Promise<Account | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const redis = getRedis();
  const normalizedEmail = await redis.get<string>(KEYS.session(token));
  if (!normalizedEmail) return null;

  const account = await getAccountByEmail(normalizedEmail);
  if (!account) return null;

  await redis.expire(KEYS.session(token), SESSION_MAX_AGE_SECONDS);

  return { email: account.email, displayName: account.displayName, createdAt: account.createdAt };
}
