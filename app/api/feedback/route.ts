import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildCaseReference, INTERVIEWER_IDENTITY, sharedRules } from '@/lib/interviewerPersona';
import { getQuestionById } from '@/lib/questionStore';
import { checkAiRateLimit, rateLimitResponseHeaders } from '@/lib/rateLimit';
import type { Guesstimate } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FeedbackRequestZ = z.object({
  guesstimateId: z.string().min(1).max(120),
  userNotes: z.string().min(1).max(4000),
});

function buildSystemInstruction(guesstimate: Guesstimate): string {
  return `${INTERVIEWER_IDENTITY}

The candidate has written out an approach and asked you to look at it — critique it the way you'd critique
what someone just put on the whiteboard. Real feedback, not encouragement for its own sake.

${buildCaseReference(guesstimate, { includeAssumptions: true, includeCoreEquation: true })}

YOUR ROLE HERE:
Assess what they wrote against what a strong answer to this specific case looks like:
- Is the structure sound — a clear chain — or muddled and incomplete?
- Are they missing a segment, multiplier, or consideration a strong candidate would include?
- Are their assumptions directionally defensible, or would you push back (implausible rate, unit mismatch,
  double-counting, wrong base population)?
- Does the logic hold together on its own terms, before anyone checks the final number?

Be specific to their actual words — paraphrase their own stated assumptions back. Generic feedback that
would fit any case is worthless here. If their notes are too sparse to assess, say exactly that as the
single gap and tell them what to put down first.

${sharedRules()}

Respond with ONLY a JSON object:
{ "strengths": ["<what's genuinely solid>"], "gaps": ["<real issues or missing pieces>"] }
At most 2 items per array, one short sentence each. Fewer is fine — never pad with filler.`;
}

export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
  }

  const rateLimit = await checkAiRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests — please wait a bit before asking for more feedback.' },
      { status: 429, headers: rateLimitResponseHeaders(rateLimit) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = FeedbackRequestZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request', issues: validation.error.issues }, { status: 400 });
  }

  const { guesstimateId, userNotes } = validation.data;

  const guesstimate = await getQuestionById(guesstimateId);
  if (!guesstimate) {
    return NextResponse.json({ error: 'Unknown guesstimate id' }, { status: 404 });
  }

  const systemInstruction = buildSystemInstruction(guesstimate);

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: `Candidate's written notes:\n"""\n${userNotes}\n"""` }] }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            strengths: { type: 'ARRAY', items: { type: 'STRING' } },
            gaps: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['strengths', 'gaps'],
        },
        temperature: 0.5,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json({ error: 'Empty response from model' }, { status: 502 });
    }

    const parsed = JSON.parse(rawText) as { strengths?: string[]; gaps?: string[] };
    return NextResponse.json({ strengths: parsed.strengths ?? [], gaps: parsed.gaps ?? [] });
  } catch (error) {
    console.error('feedback route failed:', error);
    return NextResponse.json({ error: 'Failed to get feedback' }, { status: 500 });
  }
}
