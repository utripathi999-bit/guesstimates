import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteAccount, getSessionAccountFromCookies, isOwner, normalizeEmail } from '@/lib/auth';
import { getRedis, KEYS } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const RenameZ = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(40),
});

const DeleteAccountZ = z.object({
  email: z.string().trim().email(),
});

/**
 * Admin authorization: either a signed-in owner session (the /admin UI) or the
 * CRON_SECRET bearer token, the same service credential the cron and
 * leaderboard-cleanup endpoints already accept. The token path exists so
 * operational cleanup doesn't require a browser session.
 */
function hasAdminToken(request: NextRequest): boolean {
  const header = request.headers.get('authorization');
  return Boolean(process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`);
}

/**
 * Owner-only: correct a student's display name (typos, nicknames, duplicates).
 * Gated on the session account matching OWNER_EMAIL — same check as /admin.
 */
export async function PATCH(request: NextRequest) {
  const account = await getSessionAccountFromCookies();
  if (!isOwner(account)) {
    // Same shape as any unknown route would give — don't confirm this exists.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = RenameZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request', issues: validation.error.issues }, { status: 400 });
  }

  const email = normalizeEmail(validation.data.email);
  const redis = getRedis();

  const exists = await redis.hget<string>(KEYS.account(email), 'email');
  if (!exists) {
    return NextResponse.json({ error: 'No account with that email' }, { status: 404 });
  }

  // Only the display name is writable here — never the password hash or email,
  // which would let an admin action silently take over an account.
  await redis.hset(KEYS.account(email), { displayName: validation.data.displayName });

  return NextResponse.json({ success: true, displayName: validation.data.displayName });
}

/**
 * Owner-only: permanently remove an account and everything attached to it —
 * for clearing out test accounts, or a student who asks to be removed.
 * Refuses to delete the owner's own account, since that would lock you out
 * of this page with no way back in.
 */
export async function DELETE(request: NextRequest) {
  const account = await getSessionAccountFromCookies();
  const authorized = isOwner(account) || hasAdminToken(request);
  if (!authorized) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = DeleteAccountZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request', issues: validation.error.issues }, { status: 400 });
  }

  const email = normalizeEmail(validation.data.email);
  if (account && email === account.email) {
    return NextResponse.json({ error: "You can't delete your own owner account" }, { status: 400 });
  }

  try {
    await deleteAccount(email);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('account delete failed:', error);
    return NextResponse.json({ error: 'Could not delete that account' }, { status: 500 });
  }
}
