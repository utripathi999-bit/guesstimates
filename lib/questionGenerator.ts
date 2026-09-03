import { GoogleGenAI } from '@google/genai';
import { isGlobalQuestionDay } from '@/lib/dailyPicker';
import { DailyGuesstimatePairZ, GuesstimateZ, guesstimateResponseSchema } from '@/lib/guesstimateSchema';
import { INTERVIEWER_IDENTITY } from '@/lib/interviewerPersona';
import { getRedis, KEYS } from '@/lib/redis';
import type { Guesstimate } from '@/lib/types';

/**
 * Question generation, shared by the nightly cron and the admin controls so
 * a question swapped in by hand is built to exactly the same standard as one
 * generated automatically.
 */

const MODEL = 'gemini-3.5-flash';

/**
 * Advanced questions are rare on purpose. A daily habit dies if the daily
 * thing is intimidating, so the default is a case a student can get through
 * in one sitting; hard ones show up occasionally as a change of pace.
 */
const ADVANCED_DAY_INTERVAL = 7;

export function isAdvancedQuestionDay(dateStr: string): boolean {
  const daysSinceEpoch = Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 86_400_000);
  return daysSinceEpoch % ADVANCED_DAY_INTERVAL === 0;
}

/**
 * The single most important quality bar, learned from a generated case about
 * diesel consumption of backup generators in Bengaluru tech parks: technically
 * a fine guesstimate, useless as practice, because nobody can reason about
 * generator capacity from everyday life.
 */
const ANSWERABILITY_RULES = `THE ANSWERABILITY BAR — the most important rule here:
Every number a candidate needs must be something an ordinary business-aware student could reason toward
from daily life, common sense, or general awareness. They are not industry analysts and have no reference
material in front of them.
- GOOD subject matter: things people buy, use, ride, eat, subscribe to, or walk past — chai and coffee,
  phones and data plans, food delivery, cabs and autos, cinema tickets, groceries, salons, gyms, apparel,
  two-wheelers, kirana stores, e-commerce parcels, wedding spend, school fees, streaming subscriptions.
- BANNED: industrial and infrastructure metrics a normal person has never had cause to know — power
  capacity in MW or kVA, diesel generator loads, data-centre or server metrics, freight tonne-kilometres,
  telecom spectrum, industrial chemical volumes, commercial real-estate absorption, warehouse throughput,
  agricultural yields per hectare, anything measured in units students don't use.
- The test to apply before committing to a subject: could a bright student with no industry knowledge
  produce every assumption in your solution just by thinking carefully about ordinary life? If any step
  needs a number they could only get by having worked in that industry, pick a different subject.`;

const INTERVIEW_REALISM_RULES = `WHAT REAL INTERVIEWS ACTUALLY ASK:
These should look like questions genuinely put to candidates in consulting and product interviews, not
clever puzzles invented for their own sake. The recurring archetypes:
- Market size of a consumer product or service in India (or a city).
- How many units of an everyday thing are sold / consumed / used in a day.
- Revenue of a single outlet, or of a platform's operations in one city.
- How many of some visible thing a city needs (cabs, ATMs, delivery riders, gyms, salons).
- Volume of a routine daily behaviour at city or national scale.
If you can imagine an interviewer asking it across a table with no setup, it's right. If it needs a
paragraph of context before the candidate can even start, it's wrong.`;

function difficultyRule(allowAdvanced: boolean): string {
  return allowAdvanced
    ? `DIFFICULTY: one of the two may be "Advanced" today — a chain with more segmentation layers — but it must
still clear the answerability bar above. The other stays "Beginner" or "Intermediate".`
    : `DIFFICULTY: both cases must be "Beginner" or "Intermediate" — solvable in one focused sitting with a
chain of roughly 3 steps. Do NOT produce an "Advanced" case today. Easy and medium is the daily default;
hard ones are a rare change of pace, not the norm.`;
}

const QUALITY_RULES = `WHAT MAKES THESE GOOD:
- Every step's "items" must mix at least one FACTUAL anchor (isFactual: true — a real, defensible benchmark
  a well-read candidate could know) with clearly-labelled ESTIMATED assumptions (isFactual: false). The
  whole point of the product is teaching candidates which is which, so never mislabel a guess as a fact.
- "sourceOrLogic" is where students actually learn the craft, so it carries real weight — 2-3 sentences,
  not a label. For a FACTUAL anchor: where the figure comes from and roughly how confident it is. For an
  ESTIMATE, show the reasoning that produced it: what you anchored on (an everyday observation a candidate
  could plausibly reason from), why that lands on this number rather than a much higher or lower one, and
  what would move it. "Assumed based on typical usage" is a non-answer. "Most office-goers buy chai twice a
  day — once mid-morning, once post-lunch — so 2 is the floor for a working adult; students and retirees
  pull the city-wide average down, which is why 2 rather than 3" is the standard.
- Where a reasonable person could have picked a different number, say so — a student whose estimate differs
  shouldn't conclude they were wrong.
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
- Category ∈ Market Sizing | Volume Estimation | Revenue Estimation | Infrastructure & Operations.
- Approach ∈ Top-Down | Bottom-Up | Supply-Side | Demand-Side.
- Avoid tired classics (manhole covers, piano tuners in Chicago).`;

const GLOBAL_CONSTRAINT = `THE GLOBAL ONE HAS A HARD CONSTRAINT: the audience is Indian students preparing for
interviews in India. They have never lived abroad. A global case is only acceptable if an Indian student
could reason about it confidently from general knowledge.
- Use globally-famous brands and categories they genuinely know: McDonald's, Starbucks, Uber, Netflix,
  Amazon, iPhones, international airlines, global e-commerce, smartphones, cars.
- Use world cities they know well: New York, London, Singapore, Dubai, Tokyo.
- BANNED: anything needing lived local experience — ski resorts and lift passes, baseball/American
  football, European rail passes, US health insurance, local municipal services, regional supermarket
  chains, country-specific tax or benefits systems.
- Could someone in Bengaluru who has never left India estimate this from general knowledge? If there's any
  doubt, pick a different subject.`;

function recentTitlesBlock(recentTitles: string[]): string {
  if (recentTitles.length === 0) return '';
  return `\n- Do NOT repeat or closely rework any of these recently-used cases:\n${recentTitles
    .map((t) => `  - ${t}`)
    .join('\n')}`;
}

function buildPairPrompt(recentTitles: string[], includeGlobal: boolean, allowAdvanced: boolean): string {
  const composition = includeGlobal
    ? `Produce exactly 2 brand-new cases:
1. One with region "India" — real Indian context (specific cities, actual consumer behaviour, real market
   structure). Not a generic case with Indian nouns swapped in.
2. One with region "Global".

${GLOBAL_CONSTRAINT}`
    : `Produce exactly 2 brand-new cases, BOTH with region "India" — real Indian context (specific cities,
actual consumer behaviour, real market structure). Not generic cases with Indian nouns swapped in.
Make the two genuinely different from each other: different category, different approach, and a
different part of the economy — not two variations on the same market.`;

  return `${INTERVIEWER_IDENTITY}

Right now you are not running an interview — you are writing the day's cases, and the full model answer
each will be graded against. The candidate sees the question first and only unlocks your breakdown after
attempting it, so the breakdown has to be the thing they learn the method from.

${composition}

${ANSWERABILITY_RULES}

${INTERVIEW_REALISM_RULES}

${difficultyRule(allowAdvanced)}

${QUALITY_RULES}${recentTitlesBlock(recentTitles)}

Return ONLY the JSON array of 2 case objects matching the provided schema — no prose, no markdown fences.`;
}

function buildSinglePrompt(options: {
  recentTitles: string[];
  region: 'India' | 'Global';
  allowAdvanced: boolean;
  adminBrief?: string;
}): string {
  const { recentTitles, region, allowAdvanced, adminBrief } = options;

  const brief = adminBrief
    ? `THE QUESTION HAS ALREADY BEEN CHOSEN FOR YOU. Build the full case around exactly this:

"""
${adminBrief}
"""

Use it as the case's subject. You may sharpen the wording into a clean interview question for the "title"
field, but do not substitute a different subject — this was chosen deliberately. If the brief is loose,
make the reasonable interpretation an interviewer would and scope it in the clarifyingQuestions.
Set "region" to whichever of India or Global the brief actually implies.`
    : `Produce ONE brand-new case with region "${region}".${region === 'Global' ? `\n\n${GLOBAL_CONSTRAINT}` : ''}`;

  return `${INTERVIEWER_IDENTITY}

You are writing a single case and the full model answer it will be graded against. The candidate sees the
question first and only unlocks your breakdown after attempting it, so the breakdown has to be the thing
they learn the method from.

${brief}

${ANSWERABILITY_RULES}

${INTERVIEW_REALISM_RULES}

${difficultyRule(allowAdvanced)}

${QUALITY_RULES}${recentTitlesBlock(recentTitles)}

Return ONLY a JSON array containing exactly ONE case object matching the provided schema — no prose, no
markdown fences.`;
}

/** Recent titles, so generation doesn't slowly converge on the same handful of cases. */
export async function getRecentTitles(limit = 20): Promise<string[]> {
  try {
    const recentRaw = await getRedis().lrange<string>(KEYS.archive, -limit, -1);
    return recentRaw
      .map((entry) => {
        try {
          return (typeof entry === 'string' ? JSON.parse(entry) : entry)?.title as string | undefined;
        } catch {
          return undefined;
        }
      })
      .filter((title): title is string => Boolean(title));
  } catch (error) {
    console.error('questionGenerator: could not read recent titles', error);
    return [];
  }
}

async function callModel(prompt: string): Promise<unknown> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: guesstimateResponseSchema,
      temperature: 0.9,
    },
  });

  const rawText = response.text;
  if (!rawText) throw new Error('Empty response from model');
  return JSON.parse(rawText);
}

export async function generateDailyPair(dateStr: string): Promise<[Guesstimate, Guesstimate]> {
  const recentTitles = await getRecentTitles();
  const includeGlobal = isGlobalQuestionDay(dateStr);
  const parsed = await callModel(buildPairPrompt(recentTitles, includeGlobal, isAdvancedQuestionDay(dateStr)));

  const validation = DailyGuesstimatePairZ.safeParse(parsed);
  if (!validation.success) {
    throw new Error(`Generated payload failed schema validation: ${validation.error.issues[0]?.message}`);
  }

  const pair = validation.data as [Guesstimate, Guesstimate];

  // Enforce the region mix rather than trusting the prompt.
  const globalCount = pair.filter((q) => q.region === 'Global').length;
  const allowedGlobal = includeGlobal ? 1 : 0;
  if (globalCount !== allowedGlobal) {
    throw new Error(`Generated set has the wrong region mix (expected ${allowedGlobal} global, got ${globalCount})`);
  }

  return pair;
}

/** One replacement question — either freely generated, or built from an admin's own brief. */
export async function generateSingleQuestion(options: {
  region?: 'India' | 'Global';
  allowAdvanced?: boolean;
  adminBrief?: string;
}): Promise<Guesstimate> {
  const recentTitles = await getRecentTitles();
  const parsed = await callModel(
    buildSinglePrompt({
      recentTitles,
      region: options.region ?? 'India',
      allowAdvanced: options.allowAdvanced ?? false,
      adminBrief: options.adminBrief,
    })
  );

  // The schema is an array; take the first entry whichever shape comes back.
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  const validation = GuesstimateZ.safeParse(candidate);
  if (!validation.success) {
    throw new Error(`Generated question failed schema validation: ${validation.error.issues[0]?.message}`);
  }
  return validation.data as Guesstimate;
}

/** Persists a day's pair and makes each question individually resolvable. */
export async function saveDailyPair(dateStr: string, pair: Guesstimate[]): Promise<void> {
  const redis = getRedis();
  const writes: Promise<unknown>[] = pair.map((q) => redis.set(KEYS.question(q.id), q));
  writes.push(redis.set(KEYS.dailyQuestions(dateStr), pair));
  writes.push(
    redis.rpush(
      KEYS.archive,
      ...pair.map((q) => JSON.stringify({ id: q.id, title: q.title, region: q.region, date: dateStr }))
    )
  );
  await Promise.all(writes);
}
