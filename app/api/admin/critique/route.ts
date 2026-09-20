import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionAccountFromCookies, isOwner } from '@/lib/auth';
import { critiqueQuestion } from '@/lib/questionCritic';
import { getQuestionById } from '@/lib/questionStore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Runs the critic against any stored question, on demand, and returns its
 * verdict verbatim.
 *
 * This is the window into the critic. Everywhere else it runs inside
 * generation, where all you see is the question that survived — you cannot tell
 * a question nobody objected to from one that was waved through because the
 * critic was down. Pointing this at a question known to be wrong is how you
 * confirm it actually pushes back rather than agreeing with everything.
 */
const RequestZ = z.object({ questionId: z.string().min(1).max(120) });

function authorized(request: NextRequest, isOwnerSession: boolean): boolean {
  const header = request.headers.get('authorization');
  const hasToken = Boolean(process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`);
  return isOwnerSession || hasToken;
}

export async function POST(request: NextRequest) {
  const account = await getSessionAccountFromCookies();
  if (!authorized(request, isOwner(account))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = RequestZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const question = await getQuestionById(validation.data.questionId);
  if (!question) return NextResponse.json({ error: 'Unknown question' }, { status: 404 });

  // critiqueQuestion never throws — a 'skipped' verdict is a real answer here,
  // and saying the critic could not run is more useful than a 500.
  const critique = await critiqueQuestion(question, 1);
  return NextResponse.json({ critique });
}
