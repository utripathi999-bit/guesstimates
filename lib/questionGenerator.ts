import { isGlobalQuestionDay } from '@/lib/dailyPicker';
import { callInterviewerModel } from '@/lib/geminiCall';
import { DailyGuesstimatePairZ, GuesstimateZ, guesstimateResponseSchema } from '@/lib/guesstimateSchema';
import { INTERVIEWER_IDENTITY } from '@/lib/interviewerPersona';
import { critiqueQuestion, MAX_CRITIC_ATTEMPTS, reviewQuestionPremise, type Critique } from '@/lib/questionCritic';
import { getRedis, KEYS } from '@/lib/redis';
import type { Guesstimate } from '@/lib/types';

/**
 * Question generation, shared by the nightly cron and the admin controls so
 * a question swapped in by hand is built to exactly the same standard as one
 * generated automatically.
 */

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
- "answer" is the target the student commits a number against before they see any of this, so it has to be
  unambiguous on its own. "answer.label" names the quantity in full and settles money-vs-volume outright:
  "Total annual revenue from ticket sales", not "Annual sales". "answer.unit" carries the scale as well as
  the unit — "₹ crore per year", "million units per year", "cups per day" — because a student who reads
  "₹" alone will not know whether to type 4200 or 42000000000. "answer.value" is that same worked answer as
  a plain number in exactly that unit, and it must equal what the final step arrives at. If the title asks
  for a rupee figure, the unit is money; if it asks how many, the unit is countable things. Never both.

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
export async function getRecentTitles(limit = 60): Promise<string[]> {
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

  // Runs down the shared model chain rather than pinning one model: generation
  // used to be the only path with no fallback, which meant a capacity spike at
  // 05:30 would have handed the whole batch yesterday's seed questions.
  const { raw } = await callInterviewerModel({
    systemInstruction: 'You write guesstimate interview cases. Reply only with JSON matching the schema.',
    userMessage: prompt,
    responseSchema: guesstimateResponseSchema,
    temperature: 0.9,
    // A full case with steps, items and assumptions does not fit a chat budget.
    maxOutputTokens: 16384,
  });
  return JSON.parse(raw);
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

export interface ReviewedQuestion {
  question: Guesstimate;
  /** Every round's verdict, oldest first — the audit trail the admin reads. */
  critiques: Critique[];
}

/**
 * Reworks the solution to a question the critic rejected, keeping the question
 * itself intact.
 *
 * The case being asked is rarely the problem — the parcel question was a
 * perfectly good thing to ask, and only its *working* was wrong. Throwing the
 * whole case away and drawing a new topic would discard a good question to fix
 * a bad calculation, and would also mean the critic's specific objections were
 * never actually answered by anyone. So the writer is handed the reviewer's
 * independent number and every concern raised, and asked to produce the working
 * again for the same question.
 */
async function reviseSolution(question: Guesstimate, critique: Critique): Promise<Guesstimate> {
  const concerns = (critique.concerns ?? []).map((c) => `- ${c}`).join('\n');
  const prompt = `${INTERVIEWER_IDENTITY}

You wrote the case below. A senior reviewer worked the same question independently and disagrees with your
answer. Rework it.

${describeCaseForRevision(question)}

THE REVIEWER'S INDEPENDENT ANSWER: ${critique.independentEstimate ?? '(not given)'} ${question.answer?.unit ?? ''}
THEIR ROUTE: ${critique.method ?? '(not given)'}
WHAT THEY SAID: ${critique.reasoning ?? '(not given)'}

THEIR SPECIFIC OBJECTIONS:
${concerns || '- (none itemised; the gap between the two answers is the objection)'}

REWORK IT AS FOLLOWS:
- Keep the SAME question, title, and the same thing being estimated in the same unit. You are fixing the
  working, not choosing a new case.
- Address every objection above explicitly in the numbers you choose. If they say a segment was set to zero,
  give it a real non-zero value. If they say a frequency is too low, raise it to something defensible and say
  in sourceOrLogic why that number.
- You are NOT required to land on the reviewer's number. If you believe your approach was right, you may keep
  it — but then the reasoning must answer their objection head-on rather than ignoring it.
- Rebuild "sanityCheck" as a genuine independent test benchmarked against the RIGHT reference class. A metro
  compared against a national per-capita average is not a passing check.
- "answer.value" must equal what your final step now arrives at.

${QUALITY_RULES}`;

  const parsed = await callModel(prompt);
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  const validation = GuesstimateZ.safeParse(candidate);
  if (!validation.success) {
    throw new Error(`Revised question failed schema validation: ${validation.error.issues[0]?.message}`);
  }

  // Identity is ours, not the model's. The id keeps committed estimates
  // attached, the title is what the student already read, and the answer's
  // label and unit are what they typed a number against — if the unit moved
  // from "₹ crore" to "₹", every estimate on record would silently become
  // wrong by a factor of ten million. Only the value and the working may move.
  const revised = validation.data as Guesstimate;
  return {
    ...revised,
    id: question.id,
    title: question.title,
    answer: question.answer && revised.answer
      ? { ...question.answer, value: revised.answer.value }
      : revised.answer,
  };
}

/**
 * Reworks the solutions of questions that are already live, without touching
 * the questions themselves.
 *
 * Generation may redraw a question whose premise is unsound, because at 05:30
 * nothing is live and a bad case is best replaced outright. Once students are
 * looking at it that trade flips: swapping the question out from under someone
 * mid-solve costs them more than a doubtful premise does. So this path is
 * solution-only by construction — the question, its id, its title and the unit
 * students answer in are all pinned.
 */
export async function reworkLiveSolutions(questions: Guesstimate[], recentTitles: string[] = []): Promise<{
  updated: Guesstimate[];
  critiques: Critique[];
  changedIds: string[];
}> {
  const critiques: Critique[] = [];
  const updated: Guesstimate[] = [];
  const changedIds: string[] = [];

  for (const question of questions) {
    // The premise is reported on but never acted on here.
    critiques.push(await reviewQuestionPremise(question, 1, recentTitles));

    const reviewed = await reviewUntilConfident(question);
    critiques.push(...reviewed.critiques);
    updated.push(reviewed.question);

    const answerMoved = reviewed.question.answer?.value !== question.answer?.value;
    if (reviewed.question !== question && answerMoved) changedIds.push(question.id);
  }

  return { updated, critiques, changedIds };
}

function describeCaseForRevision(question: Guesstimate): string {
  const steps = question.steps
    .map(
      (s) =>
        `  Step ${s.stepNumber} — ${s.stepTitle}\n${s.items
          .map((i) => `    - ${i.label}: ${i.value} (${i.isFactual ? 'fact' : 'estimate'})`)
          .join('\n')}\n    ${s.calculation} → ${s.result}`
    )
    .join('\n');

  return `QUESTION: ${question.title}
ESTIMATING: ${question.answer?.label ?? ''} in ${question.answer?.unit ?? ''}
YOUR ANSWER WAS: ${question.answer?.value ?? ''}
YOUR WORKING:
${steps}
YOUR SANITY CHECK: ${question.sanityCheck}`;
}

/**
 * Two reviews, in order, because they fail for different reasons and are fixed
 * differently.
 *
 * The premise is checked first: if the case itself is unsound — a thing that
 * does not exist, or a number no student could reason toward — then no amount
 * of reworking the arithmetic helps, and the only fix is a different question.
 * Only once the question stands does it make sense to argue about its answer.
 */
async function reviewPremiseUntilSound(
  make: () => Promise<Guesstimate>,
  first: Guesstimate,
  tries: number,
  recentTitles: string[]
): Promise<{ question: Guesstimate; critiques: Critique[] }> {
  const critiques: Critique[] = [];
  let current = first;

  for (let attempt = 1; attempt <= Math.max(1, tries); attempt += 1) {
    const review = await reviewQuestionPremise(current, attempt, recentTitles);
    critiques.push(review);
    if (review.verdict !== 'reject') return { question: current, critiques };
    if (attempt === Math.max(1, tries)) break;

    try {
      current = await make();
    } catch (error) {
      // Losing the question entirely is worse than keeping a doubted one.
      console.warn('premise review: could not draw a replacement question', error);
      break;
    }
  }

  return { question: current, critiques };
}

/**
 * Writer and critic go back and forth until the two independently agree, or
 * until the round limit stops them.
 *
 * Bounded on purpose. The cron has a wall clock and each round is two model
 * calls, so a model having a bad day must not become an unbounded argument.
 * When the limit is hit we ship the closest version rather than nothing — a
 * question the critic still doubts is far better than no questions at all — and
 * its critique goes on the record, so a shipped-but-doubted question is visibly
 * different in the admin view from one that was actually approved.
 */
async function reviewUntilConfident(
  question: Guesstimate,
  rounds = MAX_CRITIC_ATTEMPTS
): Promise<ReviewedQuestion> {
  const critiques: Critique[] = [];
  let current = question;
  let best: { question: Guesstimate; ratio: number } | null = null;

  for (let round = 1; round <= Math.max(1, rounds); round += 1) {
    const critique = await critiqueQuestion(current, round);
    critiques.push(critique);

    // 'skipped' means the critic itself could not run. Another round would just
    // spend the budget on the same outage, so take what we have.
    if (critique.verdict !== 'reject') return { question: current, critiques };

    const ratio = critique.ratio ?? Infinity;
    if (!best || ratio < best.ratio) best = { question: current, ratio };

    if (round === Math.max(1, rounds)) break;

    try {
      current = await reviseSolution(current, critique);
    } catch (error) {
      // A failed rework is not a reason to lose the question — stop here and
      // ship the closest version, with the objection recorded against it.
      console.warn('critic: revision failed for', current.id, error);
      break;
    }
  }

  return { question: best?.question ?? current, critiques };
}

/** Premise review, then the answer argument, for one question. */
async function fullyReview(
  question: Guesstimate,
  redraw: () => Promise<Guesstimate>,
  recentTitles: string[]
): Promise<ReviewedQuestion> {
  const premise = await reviewPremiseUntilSound(redraw, question, PREMISE_ATTEMPTS, recentTitles);
  const solution = await reviewUntilConfident(premise.question);
  return {
    question: solution.question,
    critiques: [...premise.critiques, ...solution.critiques],
  };
}

/** Redrawing the premise is bounded tighter than reworking a solution: it is a whole new question each time. */
const PREMISE_ATTEMPTS = 2;

export async function generateReviewedPair(dateStr: string): Promise<{
  pair: [Guesstimate, Guesstimate];
  critiques: Critique[];
}> {
  const [pair, recentTitles] = await Promise.all([generateDailyPair(dateStr), getRecentTitles()]);

  // Reviewed independently so one question's argument doesn't hold up the other
  // — but each is told its partner's title. Run in parallel, neither would
  // otherwise know the other exists, and a redraw could duplicate its own pair.
  const reviewed = await Promise.all(
    pair.map((q, i) =>
      fullyReview(
        q,
        () => generateSingleQuestion({ region: q.region, allowAdvanced: isAdvancedQuestionDay(dateStr) }),
        [...recentTitles, pair[1 - i].title]
      )
    )
  );

  return {
    pair: [reviewed[0].question, reviewed[1].question],
    critiques: reviewed.flatMap((r) => r.critiques),
  };
}

/** A single replacement question, reviewed the same way the daily pair is. */
export async function generateReviewedQuestion(options: {
  region?: 'India' | 'Global';
  allowAdvanced?: boolean;
  adminBrief?: string;
  /** Titles live alongside this one — a swap must not duplicate the question it sits next to. */
  otherTitles?: string[];
}): Promise<ReviewedQuestion> {
  const [question, recentTitles] = await Promise.all([
    generateSingleQuestion(options),
    getRecentTitles(),
  ]);
  const compareAgainst = [...recentTitles, ...(options.otherTitles ?? [])];

  // An admin's own question is reviewed but never redrawn — they asked for that
  // case specifically, so a premise or novelty objection is advice, not a veto.
  if (options.adminBrief) {
    const premise = await reviewQuestionPremise(question, 1, compareAgainst);
    const solution = await reviewUntilConfident(question);
    return { question: solution.question, critiques: [premise, ...solution.critiques] };
  }

  return fullyReview(question, () => generateSingleQuestion(options), compareAgainst);
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
