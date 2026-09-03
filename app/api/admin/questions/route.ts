import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionAccountFromCookies, isOwner } from '@/lib/auth';
import {
  generateDailyPair,
  generateSingleQuestion,
  isAdvancedQuestionDay,
  saveDailyPair,
} from '@/lib/questionGenerator';
import { getDailyPair, getUtcDateString } from '@/lib/questionStore';

export const dynamic = 'force-dynamic';
// Generation is a couple of model calls; the default function timeout is tight for two.
export const maxDuration = 60;

const ActionZ = z.discriminatedUnion('action', [
  /** Throw away today's pair and generate a fresh one. */
  z.object({ action: z.literal('regenerateAll') }),
  /** Replace one question, keeping the other. */
  z.object({ action: z.literal('replaceOne'), questionId: z.string().min(1).max(120) }),
  /** Replace one question with a case built from the admin's own brief. */
  z.object({
    action: z.literal('replaceWithBrief'),
    questionId: z.string().min(1).max(120),
    brief: z.string().trim().min(10).max(600),
  }),
]);

function authorized(request: NextRequest, isOwnerSession: boolean): boolean {
  const header = request.headers.get('authorization');
  const hasToken = Boolean(process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`);
  return isOwnerSession || hasToken;
}

/** Today's questions, so the admin UI can show what it's about to change. */
export async function GET(request: NextRequest) {
  const account = await getSessionAccountFromCookies();
  if (!authorized(request, isOwner(account))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const daily = await getDailyPair();
  return NextResponse.json({
    date: daily.date,
    source: daily.source,
    questions: daily.questions.map((q) => ({
      id: q.id,
      title: q.title,
      region: q.region,
      category: q.category,
      difficulty: q.difficulty,
    })),
  });
}

export async function POST(request: NextRequest) {
  const account = await getSessionAccountFromCookies();
  if (!authorized(request, isOwner(account))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
  }

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

  const today = getUtcDateString();
  // Bound to a local so the discriminated union narrows across the early return.
  const command = validation.data;

  try {
    if (command.action === 'regenerateAll') {
      const pair = await generateDailyPair(today);
      await saveDailyPair(today, pair);
      return NextResponse.json({
        success: true,
        questions: pair.map((q) => ({ id: q.id, title: q.title, region: q.region, difficulty: q.difficulty })),
      });
    }

    // Both remaining actions swap a single question out of today's pair.
    const current = await getDailyPair();
    const index = current.questions.findIndex((q) => q.id === command.questionId);
    if (index === -1) {
      return NextResponse.json({ error: "That question isn't in today's set" }, { status: 404 });
    }

    const replaced = current.questions[index];
    const replacement =
      command.action === 'replaceWithBrief'
        ? await generateSingleQuestion({ adminBrief: command.brief })
        : await generateSingleQuestion({
            // Keep the day's region mix intact when swapping a question out.
            region: replaced.region,
            allowAdvanced: isAdvancedQuestionDay(today),
          });

    const nextPair = [...current.questions];
    nextPair[index] = replacement;
    await saveDailyPair(today, nextPair);

    return NextResponse.json({
      success: true,
      replacedTitle: replaced.title,
      questions: nextPair.map((q) => ({ id: q.id, title: q.title, region: q.region, difficulty: q.difficulty })),
    });
  } catch (error) {
    console.error('admin question action failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update the questions' },
      { status: 502 }
    );
  }
}
