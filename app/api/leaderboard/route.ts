import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionAccount } from '@/lib/auth';
import { recordUserCompletion, removeUserFromLeaderboard } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

const RecordCompletionZ = z.object({
  streak: z.number().int().min(0),
});

const DeleteEntryZ = z.object({
  email: z.string().trim().email(),
});

/**
 * Records the CURRENTLY SIGNED-IN account's streak. Identity comes from the
 * session cookie, never from the request body — otherwise any caller could
 * post scores under someone else's name.
 */
export async function POST(request: NextRequest) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = RecordCompletionZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request', issues: validation.error.issues }, { status: 400 });
  }

  try {
    await recordUserCompletion(account.email, validation.data.streak);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('leaderboard record failed:', error);
    return NextResponse.json({ error: 'Failed to record completion' }, { status: 500 });
  }
}

/**
 * Admin-only: removes one entry from the leaderboard (e.g. test/seed data).
 * Gated by CRON_SECRET so this isn't a public "delete anyone's entry" endpoint.
 */
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = DeleteEntryZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request', issues: validation.error.issues }, { status: 400 });
  }

  try {
    await removeUserFromLeaderboard(validation.data.email.trim().toLowerCase());
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('leaderboard delete failed:', error);
    return NextResponse.json({ error: 'Failed to remove entry' }, { status: 500 });
  }
}
