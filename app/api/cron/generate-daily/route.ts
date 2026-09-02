import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { DailyGuesstimatePairZ, guesstimateResponseSchema } from '@/lib/guesstimateSchema';
import { INTERVIEWER_IDENTITY } from '@/lib/interviewerPersona';
import { getUtcDateString } from '@/lib/questionStore';
import { getRedis, KEYS } from '@/lib/redis';

export const dynamic = 'force-dynamic';

function buildGenerationPrompt(recentTitles: string[]): string {
  return `${INTERVIEWER_IDENTITY}

Right now you are not running an interview — you are writing tomorrow's two cases, and the full model answer
each will be graded against. The candidate will see the question first and only unlock your breakdown after
they've attempted it themselves, so the breakdown has to be the thing they learn the method from.

Produce exactly 2 brand-new cases:
1. One with region "India" — real Indian context (specific cities, actual consumer behaviour, real market
   structure). Not a generic case with Indian nouns swapped in.
2. One with region "Global" — a well-known international market or city.

WHAT MAKES THESE GOOD:
- Every step's "items" must mix at least one FACTUAL anchor (isFactual: true — a real, defensible benchmark
  a well-read candidate could know) with clearly-labelled ESTIMATED assumptions (isFactual: false). The
  whole point of the product is teaching candidates which is which, so never mislabel a guess as a fact.
- "sourceOrLogic" is one line: where a factual number comes from, or the reasoning behind an estimate.
- Steps chain: each step's calculation consumes the previous step's result. The finalAnswer must actually
  follow arithmetically from the last step — a candidate will check.
- "clarifyingQuestions" are the scoping questions a strong candidate would open with, and you will later have
  to answer them consistently, so make them ones the case's scope genuinely resolves.
- "sanityCheck" must be a real cross-check (a per-capita or per-unit reality test), not a restatement.
- "interviewerTips" are what separates a good answer from a great one — method, not trivia.

STYLE: every field is read by someone under time pressure. Tight, concrete sentences. No padding, no
throat-clearing, no restating the title.

CONSTRAINTS:
- "id" is a unique kebab-case slug from the title.
- Difficulty reflects how many segmentation layers the chain needs: Beginner, Intermediate, or Advanced.
- Category ∈ Market Sizing | Volume Estimation | Revenue Estimation | Infrastructure & Operations.
- Approach ∈ Top-Down | Bottom-Up | Supply-Side | Demand-Side.
- Avoid tired classics (manhole covers, piano tuners in Chicago).
${recentTitles.length > 0 ? `- Do NOT repeat or closely rework any of these recently-used cases:\n${recentTitles.map((t) => `  - ${t}`).join('\n')}` : ''}

Return ONLY the JSON array of 2 case objects matching the provided schema — no prose, no markdown fences.`;
}

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
    const redis = getRedis();

    // Feed recent titles back in so the model doesn't slowly converge on the
    // same handful of cases night after night.
    let recentTitles: string[] = [];
    try {
      const recentRaw = await redis.lrange<string>(KEYS.archive, -20, -1);
      recentTitles = recentRaw
        .map((entry) => {
          try {
            return (typeof entry === 'string' ? JSON.parse(entry) : entry)?.title as string | undefined;
          } catch {
            return undefined;
          }
        })
        .filter((title): title is string => Boolean(title));
    } catch (error) {
      console.error('generate-daily: could not read recent titles, generating without them', error);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: buildGenerationPrompt(recentTitles),
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

    // Store each question under its own key as well as the daily pair: the daily
    // key answers "what's today's set", the per-id keys keep every question
    // resolvable afterwards — for the detail page, the archive, and the AI
    // routes, all of which look questions up by id long after their day passes.
    const writes: Promise<unknown>[] = dailyPair.map((question) => redis.set(KEYS.question(question.id), question));
    writes.push(redis.set(KEYS.dailyQuestions(today), dailyPair));
    writes.push(
      redis.rpush(
        KEYS.archive,
        ...dailyPair.map((q) => JSON.stringify({ id: q.id, title: q.title, region: q.region, date: today }))
      )
    );
    await Promise.all(writes);

    return NextResponse.json({ success: true, date: today, questionIds: dailyPair.map((q) => q.id) });
  } catch (error) {
    console.error('generate-daily cron failed:', error);
    return NextResponse.json({ error: 'Failed to generate daily guesstimates' }, { status: 500 });
  }
}
