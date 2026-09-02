import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { getRedis, KEYS } from '@/lib/redis';
import { DailyGuesstimatePairZ, guesstimateResponseSchema } from '@/lib/guesstimateSchema';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are a former top-tier management consultant who designs guesstimate interview
questions for a gamified interview-prep product called GuesstimateDaily.

Generate exactly 2 brand-new guesstimate questions:
1. One with region "India" — grounded in realistic, India-specific context (cities, consumer behavior, market
   structure). Use plausible, defensible factual anchors (population figures, penetration rates, benchmark
   metrics) and clearly separate them from educated assumptions.
2. One with region "Global" — set in a well-known international market or city.

Rules:
- Every step's "items" array must mix at least one FACTUAL anchor (isFactual: true, a real or well-established
  benchmark number) with clearly labeled ESTIMATED assumptions (isFactual: false), each with a one-line
  sourceOrLogic explaining where the number comes from or how it was reasoned.
- Steps must chain logically: each step's calculation should use the previous step's result.
- "id" must be a unique kebab-case slug derived from the title.
- Keep numbers internally consistent — the finalAnswer must actually follow from the last step's result.
- Avoid duplicating well-known question titles like "manhole covers" or "piano tuners in Chicago".
- Difficulty should be Beginner, Intermediate, or Advanced based on how many segmentation layers are involved.
- Category must be one of: Market Sizing, Volume Estimation, Revenue Estimation, Infrastructure & Operations.
- Approach must be one of: Top-Down, Bottom-Up, Supply-Side, Demand-Side.

Return ONLY the JSON array of 2 guesstimate objects matching the provided schema — no prose, no markdown fences.`;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: SYSTEM_PROMPT,
      config: {
        responseMimeType: 'application/json',
        responseSchema: guesstimateResponseSchema,
        temperature: 0.9,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json({ error: 'Empty response from model' }, { status: 502 });
    }

    const parsedJson = JSON.parse(rawText);
    const validation = DailyGuesstimatePairZ.safeParse(parsedJson);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Generated payload failed schema validation', issues: validation.error.issues },
        { status: 502 }
      );
    }

    const dailyPair = validation.data;
    const redis = getRedis();

    await redis.set(KEYS.dailyQuestions(today), dailyPair);
    await redis.rpush(
      KEYS.archive,
      ...dailyPair.map((q) => JSON.stringify({ id: q.id, title: q.title, region: q.region, date: today }))
    );

    return NextResponse.json({ success: true, date: today, questionIds: dailyPair.map((q) => q.id) });
  } catch (error) {
    console.error('generate-daily cron failed:', error);
    return NextResponse.json({ error: 'Failed to generate daily guesstimates' }, { status: 500 });
  }
}
