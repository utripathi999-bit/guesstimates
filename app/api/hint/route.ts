import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildCaseReference, INTERVIEWER_IDENTITY, sharedRules } from '@/lib/interviewerPersona';
import { getQuestionById } from '@/lib/questionStore';
import { checkAiRateLimit, rateLimitResponseHeaders } from '@/lib/rateLimit';
import type { Guesstimate } from '@/lib/types';

export const dynamic = 'force-dynamic';

const HintRequestZ = z.object({
  guesstimateId: z.string().min(1).max(120),
  userNotes: z.string().max(4000),
  /**
   * What the candidate has already settled with the interviewer during
   * scoping. Without it the hint can nudge toward something they've already
   * pinned down, which reads as if the interviewer wasn't listening.
   */
  clarifications: z
    .array(z.object({ question: z.string().max(300), answer: z.string().max(600) }))
    .max(6)
    .optional(),
});

function buildSystemInstruction(guesstimate: Guesstimate): string {
  return `${INTERVIEWER_IDENTITY}

The candidate is mid-problem, working out loud in their scratchpad, and has asked you for a nudge.

${buildCaseReference(guesstimate, { includeStepChain: true, includeAssumptions: true })}

YOUR ROLE HERE:
Work out roughly where they are in the intended chain, then give ONE concrete nudge toward what they're
missing or getting wrong next — never a generic "have you considered segmentation" that would fit any case.
Name the actual kind of thing they're missing in your own words ("how often each person does this in a
day", "whether everyone in that group even uses it", "a capacity ceiling on the supply side").

State it directly when that's more useful than asking — "you haven't split out X yet" beats a coy question
every time. If they've already covered the chain, say so and point at a real refinement or sanity check
rather than inventing a gap. If their notes are empty or a stray sentence, tell them to put down a
population or base unit first and what kind of split it will need.

IF A SCOPING EXCHANGE IS SHOWN BELOW, it is what you already told this candidate earlier in the interview.
Treat it as settled and stay consistent with it — never nudge them toward something you've already ruled in
or out, and never contradict an answer you gave. If a scoping answer implies work they haven't done yet
(you told them to include a segment and their notes don't have it), that is the strongest thing to nudge on.

${sharedRules()}

Respond with ONLY a JSON object: { "hint": "<your nudge, 1-2 sentences>" }`;
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

  const { guesstimateId, userNotes, clarifications } = validation.data;

  // Independent of each other, so pay for one round trip rather than two.
  const [rateLimit, guesstimate] = await Promise.all([
    checkAiRateLimit(request),
    getQuestionById(guesstimateId),
  ]);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests — please wait a bit before asking for another hint.' },
      { status: 429, headers: rateLimitResponseHeaders(rateLimit) }
    );
  }

  if (!guesstimate) {
    return NextResponse.json({ error: 'Unknown guesstimate id' }, { status: 404 });
  }

  const systemInstruction = buildSystemInstruction(guesstimate);

  const scopingExchange = (clarifications ?? [])
    .map((turn) => `Candidate asked: ${turn.question}\nYou answered: ${turn.answer}`)
    .join('\n\n');

  const userMessage = [
    scopingExchange ? `Scoping already settled with this candidate:\n"""\n${scopingExchange}\n"""` : '',
    `Candidate's scratchpad notes so far:\n"""\n${userNotes || '(empty — candidate has not written anything yet)'}\n"""`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { hint: { type: 'STRING' } },
          required: ['hint'],
        },
        temperature: 0.7,
        maxOutputTokens: 260,
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
