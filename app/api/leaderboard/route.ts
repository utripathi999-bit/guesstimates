import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordUserCompletion } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

const RecordCompletionZ = z.object({
  userId: z.string().min(1).max(60),
  streak: z.number().int().min(0),
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
