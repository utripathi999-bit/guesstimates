import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionAccountFromCookies, isOwner, normalizeEmail } from '@/lib/auth';
import { getRedis, KEYS } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const RenameZ = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(40),
});

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
