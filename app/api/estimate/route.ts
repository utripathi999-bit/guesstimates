import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionAccount } from '@/lib/auth';
import { getBatchStats, getSubmittedEstimate, submitEstimate } from '@/lib/estimates';
import { scoreAccuracy } from '@/lib/estimateMath';
import { getQuestionById } from '@/lib/questionStore';

export const dynamic = 'force-dynamic';

const SubmitZ = z.object({
  questionId: z.string().min(1).max(120),
  /** Already parsed client-side, but re-checked here — the client is never the authority. */
  value: z.number().positive().finite(),
});

/**
 * Where the student's number is committed before the solution unlocks.
 *
 * Grading happens here rather than in the browser for the obvious reason: the
 * worked answer would otherwise have to be in the page before they've answered,
 * which is exactly what the gate exists to prevent.
 */
export async function GET(request: NextRequest) {
  const account = await getSessionAccount(request);
  const questionId = request.nextUrl.searchParams.get('questionId');
  if (!questionId) return NextResponse.json({ error: 'Missing questionId' }, { status: 400 });

  const question = await getQuestionById(questionId);
  if (!question) return NextResponse.json({ error: 'Unknown question' }, { status: 404 });

  // Signed out: nothing of theirs to return, and no answer to leak either.
  if (!account) return NextResponse.json({ submitted: null });

  const yourValue = await getSubmittedEstimate(account.email, questionId);
  if (yourValue === null) return NextResponse.json({ submitted: null });

  const actual = question.answer?.value ?? null;
  return NextResponse.json({
    submitted: {
      yourValue,
      actual,
      accuracy: actual !== null ? scoreAccuracy(yourValue, actual) : null,
      batch: await getBatchStats(questionId),
    },
  });
}

export async function POST(request: NextRequest) {
  const account = await getSessionAccount(request);
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = SubmitZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Enter a number greater than zero.' }, { status: 400 });
  }

  const { questionId, value } = validation.data;
  const question = await getQuestionById(questionId);
  if (!question) return NextResponse.json({ error: 'Unknown question' }, { status: 404 });

  try {
    const outcome = await submitEstimate(account.email, questionId, value, question.answer?.value ?? null);
    return NextResponse.json({ submitted: outcome });
  } catch (error) {
    console.error('estimate submit failed:', error);
    return NextResponse.json({ error: 'Could not save your estimate' }, { status: 500 });
  }
}
