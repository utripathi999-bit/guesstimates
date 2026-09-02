import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const HintRequestZ = z.object({
  questionTitle: z.string().min(1).max(300),
  userNotes: z.string().max(4000),
});

const SYSTEM_INSTRUCTION = `You are a sharp, encouraging consulting-case interviewer sitting across from a
candidate who is working through a guesstimate problem out loud in their scratchpad.

Read the candidate's notes so far and respond with ONE short Socratic hint, 1-2 sentences, that nudges their
structure forward — for example, pointing out a missing demographic split, an unstated supply-side constraint,
a segment they haven't considered, or a gap in their logic chain.

Strict rules:
- NEVER reveal the final numeric answer.
- NEVER state or imply any of the exact calculation numbers, formulas, or intermediate results for this problem.
- Do not solve any part of the problem for them — only ask a guiding question or point at a gap.
- Keep it to 1-2 sentences, encouraging in tone, like a real interviewer steering a candidate.
- If the candidate's notes are empty or very sparse, gently prompt them to state their population/base unit first.

Respond with ONLY a JSON object: { "hint": "<your 1-2 sentence hint>" }`;

export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = HintRequestZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request', issues: validation.error.issues }, { status: 400 });
  }

  const { questionTitle, userNotes } = validation.data;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Guesstimate question: "${questionTitle}"\n\nCandidate's scratchpad notes so far:\n"""\n${userNotes || '(empty — candidate has not written anything yet)'}\n"""`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { hint: { type: 'STRING' } },
          required: ['hint'],
        },
        temperature: 0.7,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json({ error: 'Empty response from model' }, { status: 502 });
    }

    const parsed = JSON.parse(rawText) as { hint?: string };
    if (!parsed.hint) {
      return NextResponse.json({ error: 'Malformed hint response' }, { status: 502 });
    }

    return NextResponse.json({ hint: parsed.hint });
  } catch (error) {
    console.error('hint route failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate hint', debug: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
