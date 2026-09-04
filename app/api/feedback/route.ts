import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callInterviewerModel } from '@/lib/geminiCall';
import { buildCaseReference, INTERVIEWER_IDENTITY, sharedRules } from '@/lib/interviewerPersona';
import { getQuestionById } from '@/lib/questionStore';
import { checkAiRateLimit, rateLimitResponseHeaders } from '@/lib/rateLimit';
import type { Guesstimate } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FeedbackRequestZ = z.object({
  guesstimateId: z.string().min(1).max(120),
  userNotes: z.string().min(1).max(4000),
  /** Scoping already settled with the interviewer — see the hint route for why. */
  clarifications: z
    .array(z.object({ question: z.string().max(300), answer: z.string().max(600) }))
    .max(6)
    .optional(),
});

function buildSystemInstruction(guesstimate: Guesstimate): string {
  return `${INTERVIEWER_IDENTITY}

The candidate has written out an approach and asked you to look at it — critique it the way you'd critique
what someone just put on the whiteboard. Real feedback, not encouragement for its own sake.

${buildCaseReference(guesstimate, { includeAssumptions: true, includeCoreEquation: true })}

YOUR ROLE HERE:
Assess their APPROACH first — that is what a guesstimate is actually testing:
- Is the structure sound — a clear chain from a base unit to an answer — or muddled and incomplete?
- Are they missing a segment, multiplier, or consideration a strong candidate would include?
- Does the logic hold together on its own terms? (Units consistent, no double-counting, each step
  actually feeding the next.)
- Have they stated their assumptions explicitly, so an interviewer could challenge them?

Their specific numbers are the LAST thing you look at, and only per the flexibility rules below — a
plausible-but-different assumption is not a gap, and listing it as one teaches them to guess what the
interviewer wanted instead of reasoning for themselves.

If a scoping exchange is shown, it's what you already told this candidate — don't fault them for a choice
you handed them, and do flag it if a scoping answer implies work their notes are missing.

Be specific to their actual words — paraphrase their own stated structure back. Generic feedback that
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

  const { guesstimateId, userNotes, clarifications } = validation.data;

  // Independent of each other, so pay for one round trip rather than two.
  const [rateLimit, guesstimate] = await Promise.all([
    checkAiRateLimit(request),
    getQuestionById(guesstimateId),
  ]);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests — please wait a bit before asking for more feedback.' },
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
    `Candidate's written notes:\n"""\n${userNotes}\n"""`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const { raw: rawText } = await callInterviewerModel({
      systemInstruction,
      userMessage,
      responseSchema: {
        type: 'OBJECT',
        properties: {
          strengths: { type: 'ARRAY', items: { type: 'STRING' } },
          gaps: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['strengths', 'gaps'],
      },
      temperature: 0.5,
    });

    let parsed: { strengths?: string[]; gaps?: string[] };
    try {
      parsed = JSON.parse(rawText) as { strengths?: string[]; gaps?: string[] };
    } catch {
      console.error('feedback: unparseable model output', rawText.slice(0, 300));
      return NextResponse.json(
        { error: 'That feedback came back incomplete — ask again and it should come through.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ strengths: parsed.strengths ?? [], gaps: parsed.gaps ?? [] });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('feedback route failed:', detail);
    return NextResponse.json({ error: 'Failed to get feedback', detail }, { status: 500 });
  }
}
