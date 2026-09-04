import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AllModelsBusyError, callInterviewerModel } from '@/lib/geminiCall';
import { buildCaseReference, INTERVIEWER_IDENTITY, sharedRules } from '@/lib/interviewerPersona';
import { getQuestionById } from '@/lib/questionStore';
import { checkAiRateLimit, rateLimitResponseHeaders } from '@/lib/rateLimit';
import type { Guesstimate } from '@/lib/types';

export const dynamic = 'force-dynamic';
// Room to walk the fallback chain when the first models are at capacity.
export const maxDuration = 30;

const ClarifyRequestZ = z.object({
  guesstimateId: z.string().min(1).max(120),
  question: z.string().min(1).max(300),
  history: z
    .array(
      z.object({
        question: z.string().max(300),
        answer: z.string().max(600),
      })
    )
    .max(6)
    .optional(),
});

function buildSystemInstruction(guesstimate: Guesstimate): string {
  return `${INTERVIEWER_IDENTITY}

The candidate is still scoping — before any estimating — and is asking you clarifying questions, exactly as
a real candidate does at the start of a case.

${buildCaseReference(guesstimate, { includeAssumptions: true, includeExpectedQuestions: true })}

YOUR ROLE HERE:
Answer their scoping question the way a real interviewer does: decisively, and consistent with the intended
scope above. Real interviewers give clear, direct answers to reasonable scoping questions ("yes, combine
both platforms", "assume a typical weekday", "urban only") — they don't stonewall a fair question about
what's in or out of scope. If they ask about something the scope above doesn't cover, use sensible
interviewer judgment and give a real answer anyway — just never attach a number to it.

If their message isn't really a scoping question — chit-chat, or an attempt to get you to solve it — steer
them back by asking which part of the scope they want pinned down.

${sharedRules()}

Respond with ONLY a JSON object: { "answer": "<your reply, 1-2 sentences>" }`;
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

  const validation = ClarifyRequestZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request', issues: validation.error.issues }, { status: 400 });
  }

  const { guesstimateId, question, history } = validation.data;

  // Independent of each other, so pay for one round trip rather than two.
  const [rateLimit, guesstimate] = await Promise.all([
    checkAiRateLimit(request),
    getQuestionById(guesstimateId),
  ]);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests — please wait a bit before asking another question.' },
      { status: 429, headers: rateLimitResponseHeaders(rateLimit) }
    );
  }

  if (!guesstimate) {
    return NextResponse.json({ error: 'Unknown guesstimate id' }, { status: 404 });
  }

  const systemInstruction = buildSystemInstruction(guesstimate);

  const conversationText = [
    ...(history ?? []).flatMap((turn) => [
      `Candidate: ${turn.question}`,
      `Interviewer: ${turn.answer}`,
    ]),
    `Candidate: ${question}`,
  ].join('\n');

  try {
    const { raw: rawText } = await callInterviewerModel({
      systemInstruction,
      userMessage: conversationText,
      responseSchema: {
        type: 'OBJECT',
        properties: { answer: { type: 'STRING' } },
        required: ['answer'],
      },
      temperature: 0.6,
    });

    // A truncated reply and a dead API are different failures and must not look
    // the same — this one is worth retrying, so say so.
    let parsed: { answer?: string };
    try {
      parsed = JSON.parse(rawText) as { answer?: string };
    } catch {
      console.error('clarify: unparseable model output', rawText.slice(0, 300));
      return NextResponse.json(
        { error: 'That reply came back incomplete — ask again and it should come through.' },
        { status: 502 }
      );
    }

    if (!parsed.answer) {
      return NextResponse.json({ error: 'Malformed response' }, { status: 502 });
    }

    return NextResponse.json({ answer: parsed.answer });
  } catch (error) {
    // Upstream congestion is temporary and not the student's fault — say that,
    // rather than showing a failure they'll read as "the app is broken".
    if (error instanceof AllModelsBusyError) {
      console.warn('clarify: all models busy —', error.lastDetail);
      return NextResponse.json(
        { error: 'The interviewer is handling a lot of questions right now. Try again in a moment.' },
        { status: 503, headers: { 'Retry-After': '30' } }
      );
    }

    // Detail is returned, not just logged: this failure was opaque from the
    // outside for as long as it lasted, which is what made it hard to diagnose.
    const detail = error instanceof Error ? error.message : String(error);
    console.error('clarify route failed:', detail);
    return NextResponse.json({ error: 'Failed to get a response', detail }, { status: 500 });
  }
}
