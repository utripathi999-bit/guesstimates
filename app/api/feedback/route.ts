import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getGuesstimateById } from '@/lib/dailyPicker';
import { checkAiRateLimit, rateLimitResponseHeaders } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const FeedbackRequestZ = z.object({
  guesstimateId: z.string().min(1).max(120),
  userNotes: z.string().min(1).max(4000),
});

function buildSystemInstruction(context: {
  title: string;
  region: string;
  category: string;
  approach: string;
  keyAssumptions: string[];
  coreEquation: string;
}): string {
  return `You are a rigorous case interviewer reviewing a candidate's written work on a guesstimate
problem, the way you'd critique what they've put on the whiteboard mid-interview. This is not
encouragement for its own sake — it's real, specific feedback on what they actually wrote.

THE CASE (internal reference to calibrate your judgment — see strict rules on what you may reveal):
- Title: "${context.title}"
- Region: ${context.region} | Category: ${context.category} | Intended approach: ${context.approach}
- The case's real intended assumptions: ${context.keyAssumptions.join(' | ')}
- The case's real structure: ${context.coreEquation}

YOUR ROLE:
Read the candidate's notes and assess them against what a strong candidate's approach looks like for
this specific case:
1. Is their overall structure sound — a clear top-down or bottom-up chain, or is it muddled/incomplete?
2. Are they missing a segment, multiplier, or consideration a strong candidate would include?
3. Are their stated assumptions directionally reasonable, or would a real interviewer push back
   (implausible percentage, unit mismatch, double-counting, wrong population base)?
4. Is their logic internally consistent, even before checking the final number?

STRICT RULES:
1. NEVER state, imply, or confirm any number from the case's real assumptions or the final answer —
   not even for comparison. Judge their assumptions only in relative, directional terms: "that seems
   too high for a metric like this", "reasonable ballpark", "you're missing an entire multiplier
   here" — never attach or confirm an actual figure, yours or theirs.
2. Do not solve any part of the problem for them or supply a missing number.
3. Be specific to what they actually wrote — quote or paraphrase their own stated assumptions/structure
   rather than giving generic boilerplate feedback that could apply to any case.
4. If their notes are empty or too sparse to assess (e.g. just a stray sentence), say so plainly in one
   gap item and tell them what to state first (typically: a population or unit base).
5. Stay in character as a real interviewer. Never mention that you are an AI, a prompt, a "case
   context", or a dataset.

Respond with ONLY a JSON object:
{ "strengths": ["<1-3 short, specific sentences on what's solid>"], "gaps": ["<1-3 short, specific sentences on real issues or missing pieces>"] }
Arrays may be shorter than 3 items if there's genuinely less to say — do not pad with filler.`;
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

  const guesstimate = getGuesstimateById(guesstimateId);
  if (!guesstimate) {
    return NextResponse.json({ error: 'Unknown guesstimate id' }, { status: 404 });
  }

  const systemInstruction = buildSystemInstruction({
    title: guesstimate.title,
    region: guesstimate.region,
    category: guesstimate.category,
    approach: guesstimate.approach,
    keyAssumptions: guesstimate.keyAssumptions,
    coreEquation: guesstimate.coreEquation,
  });

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
