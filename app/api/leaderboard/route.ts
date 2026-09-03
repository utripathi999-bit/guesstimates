import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { removeUserFromLeaderboard } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

// No POST here by design. Scores used to be posted by the client, which made
// them forgeable and let a second device overwrite the first's total. Progress
// and scoring now live server-side — see app/api/progress/route.ts.

const DeleteEntryZ = z.object({
  email: z.string().trim().email(),
});

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
