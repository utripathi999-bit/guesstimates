import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionAccount } from '@/lib/auth';
import { EMPTY_PROGRESS, getProgress, recordAttempt, recordSolve } from '@/lib/progress';
import { getDailyPair, getQuestionById, getUtcDateString } from '@/lib/questionStore';

export const dynamic = 'force-dynamic';

const ActionZ = z.object({
  action: z.enum(['attempt', 'solve']),
  questionId: z.string().min(1).max(120),
});

/** The signed-in user's progress. Identity comes from the session, never the query. */
export async function GET(request: NextRequest) {
  const account = await getSessionAccount(request);
  if (!account) return NextResponse.json({ progress: EMPTY_PROGRESS, signedIn: false });

  const progress = await getProgress(account.email);
  return NextResponse.json({ progress, signedIn: true });
}

/**
 * Reports an action. The body names *what happened*, never what it's worth —
 * the server looks up the question, checks it's real, and applies the scoring
 * rules itself, so points can't be inflated by a modified client.
 */
export async function POST(request: NextRequest) {
  const account = await getSessionAccount(request);
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = ActionZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request', issues: validation.error.issues }, { status: 400 });
  }

  const { action, questionId } = validation.data;

  // Only real questions earn anything — a made-up id can't be used to farm points.
  const question = await getQuestionById(questionId);
  if (!question) return NextResponse.json({ error: 'Unknown question' }, { status: 404 });

  try {
    if (action === 'attempt') {
      const progress = await recordAttempt(account.email, questionId);
      return NextResponse.json({ progress });
    }

    // Today's pair and today's date come from the server, not the request.
    const daily = await getDailyPair();
    const result = await recordSolve(
      account.email,
      questionId,
      daily.questions.map((q) => q.id),
      getUtcDateString()
    );

    return NextResponse.json({
      progress: result.progress,
      pointsEarned: result.pointsEarned,
      dailyGoalJustCompleted: result.dailyGoalJustCompleted,
      freezeUsed: result.freezeUsed,
      counted: result.counted,
    });
  } catch (error) {
    console.error('progress update failed:', error);
    return NextResponse.json({ error: 'Could not save your progress' }, { status: 500 });
  }
}
