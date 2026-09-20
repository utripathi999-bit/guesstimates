import { z } from 'zod';
import { AllModelsBusyError, callInterviewerModel, parseLooseJson } from '@/lib/geminiCall';
import { getRedis, isRedisConfigured, KEYS } from '@/lib/redis';
import type { Guesstimate } from '@/lib/types';

/**
 * An adversarial second pass over a generated question, before students see it.
 *
 * It exists because of a specific failure. A question asked for daily
 * e-commerce parcels in Delhi NCR and answered 300,000 — roughly 4-5x low.
 * Three things had gone wrong and none were caught: a quarter of all households
 * were assigned exactly zero parcels, the per-household frequencies were far
 * too conservative, and the solution's own sanity check *agreed with itself*,
 * computing a per-capita figure that matched the national average and calling
 * that a good result for a top metro.
 *
 * That last one is the real lesson: a sanity check written by the same pass
 * that produced the answer will rationalise the answer. So the critic is told
 * to derive its own number by a different route and is scored on whether the
 * two agree — it cannot pass a question by simply restating its reasoning.
 */

/**
 * Search for real benchmarks, code execution to actually run the arithmetic.
 * Both were chosen against failures that already happened rather than in the
 * abstract: a market figure recalled instead of looked up, and a 10x typo that
 * survived because the chain was read rather than computed.
 */
const REVIEW_TOOLS = [{ googleSearch: {} }, { codeExecution: {} }];

const ACCEPTABLE_RATIO = 3;

/** How many times a rejected question is regenerated before we take what we have. */
export const MAX_CRITIC_ATTEMPTS = 3;

export const CritiqueZ = z.object({
  independentEstimate: z.number().positive().finite(),
  method: z.string(),
  concerns: z.array(z.string()).max(4),
  fatalFlaw: z.boolean(),
  reasoning: z.string(),
});

export type CritiqueBody = z.infer<typeof CritiqueZ>;

export interface Critique extends Partial<CritiqueBody> {
  questionId: string;
  title: string;
  verdict: 'accept' | 'reject' | 'skipped';
  /** The question's own answer, for side-by-side reading in the admin view. */
  statedAnswer: number | null;
  unit: string | null;
  /** How far apart the two answers are, always >= 1. */
  ratio: number | null;
  checkedAt: string;
  /** Which attempt produced this, 1-based. */
  attempt: number;
  /** Set when the critic could not run at all — the question passes by default. */
  skipReason?: string;
}

const critiqueResponseSchema = {
  type: 'OBJECT',
  properties: {
    independentEstimate: { type: 'NUMBER' },
    method: { type: 'STRING' },
    concerns: { type: 'ARRAY', items: { type: 'STRING' } },
    fatalFlaw: { type: 'BOOLEAN' },
    reasoning: { type: 'STRING' },
  },
  required: ['independentEstimate', 'method', 'concerns', 'fatalFlaw', 'reasoning'],
};

const CRITIC_INSTRUCTION = `You are a senior consultant reviewing a guesstimate case before it is given to MBA
candidates. You did not write it. Your job is to find out whether its answer is actually right, and you are
judged on catching bad numbers, not on being agreeable.

YOU HAVE TWO TOOLS. USE THEM — THEY ARE THE POINT.
- GOOGLE SEARCH: look up the real figures. Do not estimate from memory what you could check in one search.
  A case that asked for daily e-commerce parcels in Delhi NCR was answered 300,000 and shipped, roughly 5x
  low, because the writer and the reviewer were both recalling Indian market data instead of looking it up.
  Search for the national or market-level total you need — annual shipments, total market size, sector
  revenue, population — and anchor your own estimate on what you find. Say in "method" what you looked up.
- CODE EXECUTION: run their arithmetic rather than reading it. Multiply the chain out step by step and check
  each step's stated result against what the numbers actually produce, and that the final answer follows from
  the last step. A case understated a figure by 10x through a typo (90 million x 250 written as 22,500 crore
  instead of 2,250 crore) — executing it catches that class of error every time, reading it does not.

DO THIS FIRST, BEFORE READING THEIR REASONING CLOSELY:
Derive your own answer to the question, from scratch, using a DIFFERENT route than the solution took. If the
solution worked bottom-up from households or units, come top-down from a national or market-level total and
divide down. If it worked top-down, build up from an observable unit. Your number must come from your own
chain of reasoning, not from adjusting theirs — anchoring on their answer is the one way to be useless here.
Report it in EXACTLY the unit the question asks for.

THEN CHECK FOR THESE SPECIFIC DEFECTS, which are the ones that actually occur:
- A segment assigned exactly zero. "This group never does this" is almost never true of millions of people,
  and it silently deletes a chunk of the answer. Treat any zero-valued segment as a fatal flaw.
- Frequencies or penetration rates set implausibly low (or high) for the population described. Ask what the
  number implies per person per week and whether you believe it.
- A sanity check that restates the answer instead of testing it, or one that benchmarks against the wrong
  reference class — comparing a top-tier metro against a national per-capita average and declaring a match
  is a failure, not a pass, because a major metro should be well above the national figure.
- Arithmetic that does not chain: a step whose result is not what the next step consumes, or a final answer
  that does not follow from the last step.
- A unit mismatch between what the question asks for and what the solution computes (money vs volume,
  daily vs annual).

"fatalFlaw" is true if ANY of the above is present, regardless of how close your number is.
"concerns" lists the specific problems, each naming the actual figure or step at fault. Empty if genuinely
none — do not invent concerns to look diligent.
"reasoning" is 2-3 sentences: your route, your number, and whether you believe theirs. Name any figure you
looked up rather than assumed.

OUTPUT: reply with ONLY a JSON object, no prose around it and no markdown fence:
{"independentEstimate": <number in the question's unit>, "method": "<your route, naming what you looked up>",
 "concerns": ["<specific problem>"], "fatalFlaw": <true|false>, "reasoning": "<2-3 sentences>"}`;

function ratioBetween(a: number, b: number): number {
  if (a <= 0 || b <= 0) return Infinity;
  return a > b ? a / b : b / a;
}

function describeForCritic(question: Guesstimate): string {
  const steps = question.steps
    .map((step) => {
      const items = step.items
        .map((i) => `    - ${i.label}: ${i.value} [${i.isFactual ? 'FACT' : 'ESTIMATE'}] ${i.sourceOrLogic}`)
        .join('\n');
      return `  Step ${step.stepNumber} — ${step.stepTitle}\n${items}\n    calculation: ${step.calculation}\n    result: ${step.result}`;
    })
    .join('\n\n');

  return `QUESTION: ${question.title}
ASKS FOR: ${question.answer?.label ?? '(not specified)'}
UNIT: ${question.answer?.unit ?? '(not specified)'}
THEIR ANSWER: ${question.answer?.value ?? '(not specified)'}

CORE EQUATION: ${question.coreEquation}

THEIR WORKING:
${steps}

THEIR FINAL ANSWER TEXT: ${question.finalAnswer}
THEIR SANITY CHECK: ${question.sanityCheck}`;
}

/**
 * Reviews one question. Never throws.
 *
 * A critic that can take generation down with it is worse than no critic: the
 * cron would fail and the whole batch would get yesterday's fallback questions.
 * So every failure path — the model being at capacity, malformed output, a
 * question with no numeric answer to check — returns a 'skipped' verdict that
 * lets the question through, and says why in the record.
 */
export async function critiqueQuestion(question: Guesstimate, attempt = 1): Promise<Critique> {
  const base = {
    questionId: question.id,
    title: question.title,
    statedAnswer: question.answer?.value ?? null,
    unit: question.answer?.unit ?? null,
    checkedAt: new Date().toISOString(),
    attempt,
  };

  if (!question.answer) {
    return { ...base, verdict: 'skipped', ratio: null, skipReason: 'Question has no numeric answer to check.' };
  }

  try {
    const { raw } = await callInterviewerModel({
      systemInstruction: CRITIC_INSTRUCTION,
      userMessage: describeForCritic(question),
      // Unused while tools are on — the API won't enforce a schema alongside
      // them — but kept so turning tools off restores constrained output.
      responseSchema: critiqueResponseSchema,
      tools: REVIEW_TOOLS,
      // Low temperature: this is an assessment, not a creative task.
      temperature: 0.2,
      // Room for several tool calls and their results before the verdict.
      maxOutputTokens: 8192,
    });

    const parsed = CritiqueZ.safeParse(parseLooseJson<unknown>(raw));
    if (!parsed.success) {
      console.warn('critic: unreadable verdict for', question.id, '—', raw.slice(0, 200));
      return { ...base, verdict: 'skipped', ratio: null, skipReason: 'Critic returned an unreadable verdict.' };
    }

    const body = parsed.data;
    const ratio = ratioBetween(body.independentEstimate, question.answer.value);
    const verdict = body.fatalFlaw || ratio > ACCEPTABLE_RATIO ? 'reject' : 'accept';

    return { ...base, ...body, ratio, verdict };
  } catch (error) {
    const skipReason =
      error instanceof AllModelsBusyError
        ? 'Every model was at capacity — question passed unreviewed.'
        : `Critic failed: ${error instanceof Error ? error.message : String(error)}`;
    console.warn('critic skipped for', question.id, '—', skipReason);
    return { ...base, verdict: 'skipped', ratio: null, skipReason };
  }
}

/** Critiques are kept for a season so the admin can look back at a bad day. */
const CRITIQUE_TTL_SECONDS = 120 * 24 * 60 * 60;

/**
 * Records a critique against the day it was made. Best-effort: losing the audit
 * trail must never cost the batch its questions.
 */
export async function saveCritiques(dateStr: string, critiques: Critique[]): Promise<void> {
  if (!isRedisConfigured() || critiques.length === 0) return;
  try {
    const key = KEYS.critiques(dateStr);
    const pipeline = getRedis().pipeline();
    pipeline.set(key, critiques);
    pipeline.expire(key, CRITIQUE_TTL_SECONDS);
    await pipeline.exec();
  } catch (error) {
    console.error('critic: could not store critiques', error);
  }
}

export async function getCritiques(dateStr: string): Promise<Critique[]> {
  if (!isRedisConfigured()) return [];
  try {
    const raw = await getRedis().get<Critique[]>(KEYS.critiques(dateStr));
    return Array.isArray(raw) ? raw : [];
  } catch (error) {
    console.error('critic: could not read critiques', error);
    return [];
  }
}
