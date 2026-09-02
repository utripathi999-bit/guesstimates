import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordUserCompletion, removeUserFromLeaderboard } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

const RecordCompletionZ = z.object({
  userId: z.string().min(1).max(60),
  streak: z.number().int().min(0),
});

const DeleteEntryZ = z.object({
  userId: z.string().min(1).max(60),
});

export async function POST(request: NextRequest) {
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
    await recordUserCompletion(validation.data.userId, validation.data.streak);
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
    await removeUserFromLeaderboard(validation.data.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('leaderboard delete failed:', error);
    return NextResponse.json({ error: 'Failed to remove entry' }, { status: 500 });
  }
}
