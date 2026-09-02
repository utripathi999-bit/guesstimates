import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getGuesstimateById } from '@/lib/dailyPicker';

export const dynamic = 'force-dynamic';

const HintRequestZ = z.object({
  guesstimateId: z.string().min(1).max(120),
  userNotes: z.string().max(4000),
});

function buildSystemInstruction(context: {
  title: string;
  stepTitles: string[];
  keyAssumptions: string[];
}): string {
  return `You are a sharp, encouraging consulting-case interviewer sitting across from a candidate who is
working through a guesstimate problem out loud in their scratchpad.

THE CASE (private reference — see strict rules on what you may reveal):
- Title: "${context.title}"
- The real intended chain of steps for this case, in order: ${context.stepTitles.join(' -> ')}
- The real intended assumption categories this case turns on: ${context.keyAssumptions.join(' | ')}

YOUR ROLE:
Read the candidate's notes and figure out roughly where they are in the real chain above, then give ONE
concrete, specific nudge toward whatever they're missing or getting wrong next — not a generic "have you
considered segmentation" that could apply to any case. Name the actual category of thing they're missing
(e.g. "how often each user does this per day", "the split between people who even use this at all", "a
capacity constraint on the supply side") using your own words, grounded in the real chain above, without
ever stating the real chain's step names or numbers verbatim.

You may state an observation directly ("You haven't separated out X yet") rather than only asking
questions — a mix of direct nudges and guiding questions is more useful than being coy every time. If
their notes already cover the full chain reasonably, say so briefly and point to a genuine refinement or
sanity check instead of inventing a fake gap.

STRICT RULES:
1. NEVER state, imply, or confirm any number, percentage, or formula from the case — not the real
   assumptions, not the final answer, not even to say whether their own number is right or wrong.
2. NEVER quote the case's step titles or assumption list verbatim — describe the missing piece in your
   own words instead.
3. Do not solve any part of the problem for them.
4. Keep it to 1-3 sentences — specific and useful, not a lecture.
5. If the candidate's notes are empty or only a stray sentence, tell them plainly to state their
   population or base unit first, and roughly what kind of split it needs (without naming the real one).
6. Stay in character as a real interviewer. Never mention AI, prompts, or "case context".

Respond with ONLY a JSON object: { "hint": "<your 1-3 sentence hint>" }`;
}

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

  const { guesstimateId, userNotes } = validation.data;

  const guesstimate = getGuesstimateById(guesstimateId);
  if (!guesstimate) {
    return NextResponse.json({ error: 'Unknown guesstimate id' }, { status: 404 });
  }

  const systemInstruction = buildSystemInstruction({
    title: guesstimate.title,
    stepTitles: guesstimate.steps.map((s) => s.stepTitle),
    keyAssumptions: guesstimate.keyAssumptions,
  });

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Candidate's scratchpad notes so far:\n"""\n${userNotes || '(empty — candidate has not written anything yet)'}\n"""`,
            },
          ],
        },
      ],
      config: {
        systemInstruction,
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
    return NextResponse.json({ error: 'Failed to generate hint' }, { status: 500 });
  }
}
