import { NextRequest, NextResponse } from 'next/server';
import { saveCritiques } from '@/lib/questionCritic';
import { generateReviewedPair, saveDailyPair } from '@/lib/questionGenerator';
import { getUtcDateString } from '@/lib/questionStore';

export const dynamic = 'force-dynamic';
// Generation plus review plus any regeneration is several model calls.
export const maxDuration = 300;

/**
 * Nightly generation. The prompt-building and validation live in
 * lib/questionGenerator so the admin controls produce questions to exactly
 * the same standard as this does.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
  }

  const today = getUtcDateString();

  try {
    const { pair, critiques } = await generateReviewedPair(today);
    await saveDailyPair(today, pair);
    // Stored after the questions, never before: the audit trail is useful, but
    // losing it must not cost the batch its questions.
    await saveCritiques(today, critiques);

    return NextResponse.json({
      success: true,
      date: today,
      questionIds: pair.map((q) => q.id),
      review: critiques.map((c) => ({
        title: c.title,
        verdict: c.verdict,
        ratio: c.ratio,
        attempt: c.attempt,
        concerns: c.concerns ?? [],
      })),
    });
  } catch (error) {
    console.error('generate-daily cron failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate daily guesstimates', detail: error instanceof Error ? error.message : undefined },
      { status: 502 }
    );
  }
}
