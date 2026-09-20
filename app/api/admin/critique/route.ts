import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionAccountFromCookies, isOwner } from '@/lib/auth';
import { critiqueQuestion, reviewQuestionPremise, saveCritiques } from '@/lib/questionCritic';
import { reworkLiveSolutions, saveDailyPair } from '@/lib/questionGenerator';
import { getDailyPair, getQuestionById, getUtcDateString } from '@/lib/questionStore';

export const dynamic = 'force-dynamic';
// Four tool-using reviews, each of which may search and run code.
export const maxDuration = 300;

/**
 * Re-runs the critic over today's questions on demand and returns its verdicts.
 *
 * This is the window into the critic. Everywhere else it runs inside
 * generation, where all you see is the question that survived — you cannot tell
 * a question nobody objected to from one that was waved through because the
 * critic was down.
 *
 * `questionId` is optional and not surfaced in the UI: an id is an internal
 * slug nobody should have to know. It stays for pointing the critic at an
 * archived question from a terminal when something needs investigating.
 */
const RequestZ = z.object({
  questionId: z.string().min(1).max(120).optional(),
  /**
   * Off by default. Reviewing is always safe to run; rewriting what students
   * are currently looking at is not, so it has to be asked for explicitly.
   * Even then it only ever touches solutions — the question, its id, its title
   * and the unit students answer in are pinned by reworkLiveSolutions.
   */
  reworkSolutions: z.boolean().optional(),
});

function authorized(request: NextRequest, isOwnerSession: boolean): boolean {
  const header = request.headers.get('authorization');
  const hasToken = Boolean(process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`);
  return isOwnerSession || hasToken;
}

export async function POST(request: NextRequest) {
  const account = await getSessionAccountFromCookies();
  if (!authorized(request, isOwner(account))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // An empty body is the normal case: re-check whatever is live today.
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // No body at all is fine.
  }

  const validation = RequestZ.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const requestedId = validation.data.questionId;
  const questions = requestedId
    ? [await getQuestionById(requestedId)].filter((q): q is NonNullable<typeof q> => Boolean(q))
    : (await getDailyPair()).questions;

  if (questions.length === 0) {
    return NextResponse.json({ error: 'Unknown question' }, { status: 404 });
  }

  if (validation.data.reworkSolutions) {
    const { updated, critiques, changedIds } = await reworkLiveSolutions(questions);

    // Only write back when a solution actually moved, and only for today's
    // live pair — a targeted re-review of some archived question reports only.
    if (changedIds.length > 0 && !requestedId) {
      const today = getUtcDateString();
      await saveDailyPair(today, updated);
      await saveCritiques(today, critiques);
    }

    return NextResponse.json({ critiques, changedIds, reworked: true });
  }

  // Both stages, matching what generation does and what the report shows — a
  // re-review that only checked the answer would silently skip the premise,
  // which is the half that catches a question nobody can picture.
  //
  // Neither reviewer throws: a 'skipped' verdict is a real answer here, and
  // saying a reviewer could not run is more useful than a 500.
  const critiques = (
    await Promise.all(
      questions.map(async (q) => [await reviewQuestionPremise(q, 1), await critiqueQuestion(q, 1)])
    )
  ).flat();

  return NextResponse.json({ critiques, changedIds: [], reworked: false });
}
