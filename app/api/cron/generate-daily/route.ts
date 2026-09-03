import { NextRequest, NextResponse } from 'next/server';
import { generateDailyPair, saveDailyPair } from '@/lib/questionGenerator';
import { getUtcDateString } from '@/lib/questionStore';

export const dynamic = 'force-dynamic';

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
    const pair = await generateDailyPair(today);
    await saveDailyPair(today, pair);
    return NextResponse.json({ success: true, date: today, questionIds: pair.map((q) => q.id) });
  } catch (error) {
    console.error('generate-daily cron failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate daily guesstimates', detail: error instanceof Error ? error.message : undefined },
      { status: 502 }
    );
  }
}
