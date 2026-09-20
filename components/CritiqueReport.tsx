'use client';

import { AlertTriangle, ArrowDown, CheckCircle2, Loader2, MinusCircle, ShieldQuestion, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { extractApiErrorMessage } from '@/lib/apiError';
import { useIsClient } from '@/lib/useIsClient';
import { formatIndian } from '@/lib/estimateMath';

export interface CritiqueView {
  questionId: string;
  title: string;
  verdict: 'accept' | 'reject' | 'skipped';
  statedAnswer: number | null;
  unit: string | null;
  independentEstimate?: number;
  ratio: number | null;
  method?: string;
  concerns?: string[];
  reasoning?: string;
  stage?: 'question' | 'solution';
  attempt: number;
  skipReason?: string;
  checkedAt: string;
}

/** Above this the two answers are considered too far apart to ship. */
const ACCEPTABLE_RATIO = 3;

function formatRatio(ratio: number): string {
  return ratio < 10 ? ratio.toFixed(1) : String(Math.round(ratio));
}

/**
 * Why a round ended the way it did.
 *
 * Worth spelling out: a question can be rejected while the two answers are only
 * 1.2x apart, because a structural flaw fails it regardless of how close the
 * numbers are. Showing "Rejected · 1.2x apart" alone reads like a contradiction.
 */
function verdictLabel(c: CritiqueView): string {
  const premise = c.stage === 'question';
  if (c.verdict === 'skipped') return premise ? 'Premise not reviewed' : 'Answer not reviewed';
  if (c.verdict === 'accept') return premise ? 'Question stands up' : 'Answer agreed';
  if (premise) return 'Rejected — the question itself';
  return c.ratio !== null && c.ratio > ACCEPTABLE_RATIO
    ? `Rejected — ${formatRatio(c.ratio)}× apart`
    : 'Rejected — flaw in the working';
}

const ROUND_STYLES = {
  accept: 'bg-callout-success text-callout-success-text',
  reject: 'bg-callout-warn text-callout-warn-text',
  skipped: 'bg-callout-info text-callout-info-text',
} as const;

const ROUND_ICONS = { accept: CheckCircle2, reject: AlertTriangle, skipped: MinusCircle } as const;

function Round({ critique, index }: { critique: CritiqueView; index: number }) {
  const Icon = ROUND_ICONS[critique.verdict];

  return (
    <li className="relative pl-7">
      <span
        className={`absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[0.6rem] font-black ${ROUND_STYLES[critique.verdict]}`}
      >
        {index + 1}
      </span>

      <p className={`flex flex-wrap items-center gap-1.5 text-sm font-black ${critique.verdict === 'reject' ? 'text-callout-warn-text' : 'text-foreground'}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
        {verdictLabel(critique)}
      </p>

      {critique.skipReason ? (
        <p className="mt-1 text-sm text-text-muted">{critique.skipReason}</p>
      ) : (
        <>
          {critique.independentEstimate !== undefined && (
            <p className="font-formula mt-1 text-xs text-text-muted">
              writer <span className="font-black text-foreground">{formatIndian(critique.statedAnswer ?? NaN)}</span>
              <span className="mx-1.5">vs</span>
              reviewer <span className="font-black text-foreground">{formatIndian(critique.independentEstimate)}</span>
              {critique.unit && <span className="ml-1">{critique.unit}</span>}
            </p>
          )}

          {critique.reasoning && <p className="mt-1.5 text-sm text-text-muted">{critique.reasoning}</p>}

          {critique.concerns && critique.concerns.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {critique.concerns.map((concern, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-text-muted">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.5} />
                  {concern}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

/** A one-line account of how this question's review went. */
function summarise(rounds: CritiqueView[]): string {
  const redrawn = rounds.filter((r) => r.stage === 'question').length > 1;
  const reworked = rounds.filter((r) => r.stage !== 'question').length > 1;
  if (redrawn && reworked) return 'question redrawn, then solution reworked';
  if (redrawn) return 'question redrawn';
  if (reworked) return `solution reworked · settled in ${rounds.length} rounds`;
  return 'passed both reviews first time';
}

/** One question and every round the writer and reviewer spent on it. */
function QuestionLoop({ rounds }: { rounds: CritiqueView[] }) {
  const final = rounds[rounds.length - 1];
  const reworked = rounds.length > 1;

  return (
    <div className="shadow-card overflow-hidden rounded-2xl bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-surface-border px-4 py-3">
        <p className="min-w-0 text-sm font-black text-foreground">{final.title}</p>
        <p className="text-xs font-bold text-text-muted">{summarise(rounds)}</p>
      </div>

      <ol className="flex flex-col gap-4 p-4">
        {rounds.map((critique, i) => (
          <Round key={`${critique.attempt}-${i}`} critique={critique} index={i} />
        ))}
      </ol>

      {reworked && (
        <p className="flex items-center justify-center gap-1.5 border-t border-surface-border bg-background px-4 py-2 text-xs font-bold text-text-muted">
          <ArrowDown className="h-3 w-3" strokeWidth={3} />
          Students see the version from round {rounds.length}
        </p>
      )}
    </div>
  );
}

/**
 * The admin's view of the writer/reviewer loop.
 *
 * Grouped by question rather than listed flat: the same case appearing twice
 * with an "attempt 2" tag gave no sense that a rejection and a rework were the
 * same conversation, which is the only thing this report is for.
 */
export function CritiqueReport({ initial }: { initial: CritiqueView[] }) {
  const [critiques, setCritiques] = useState(initial);
  const [running, setRunning] = useState<'review' | 'rework' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // See AdminQuestions: a pre-hydration click does nothing at all, which is
  // worse than a disabled button because it looks like the action failed.
  const ready = useIsClient();
  const [error, setError] = useState<string | null>(null);

  async function run(reworkSolutions: boolean) {
    setRunning(reworkSolutions ? 'rework' : 'review');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reworkSolutions }),
      });
      if (!res.ok) {
        setError(await extractApiErrorMessage(res, 'Could not run the review.'));
        return;
      }
      const data: { critiques: CritiqueView[]; changedIds: string[]; reworked: boolean } = await res.json();
      setCritiques(data.critiques);
      if (data.reworked) {
        setNotice(
          data.changedIds.length === 0
            ? 'Nothing needed reworking — every solution held up.'
            : `Reworked ${data.changedIds.length} solution${data.changedIds.length === 1 ? '' : 's'}. The questions are unchanged.`
        );
      }
    } catch {
      setError('Could not run the review.');
    } finally {
      setRunning(null);
    }
  }

  // Insertion order keeps the questions in the order they were generated; rounds
  // within a question are ordered by the attempt that produced them.
  const grouped = new Map<string, CritiqueView[]>();
  for (const critique of critiques) {
    const rounds = grouped.get(critique.questionId) ?? [];
    rounds.push(critique);
    grouped.set(critique.questionId, rounds);
  }
  for (const rounds of grouped.values()) rounds.sort((a, b) => a.attempt - b.attempt);

  const totalRounds = critiques.length;
  const reworkedCount = [...grouped.values()].filter((r) => r.length > 1).length;

  return (
    <section className="mb-10">
      <h2 className="text-display flex items-center gap-2 text-2xl font-black text-foreground">
        <ShieldQuestion className="h-5 w-5 text-assumed-dark" strokeWidth={2.5} />
        Question review
      </h2>
      <p className="mb-4 mt-1 text-sm text-text-muted">
        Before students see a question, a reviewer works it independently. If its answer is more than{' '}
        {ACCEPTABLE_RATIO}× away, or it finds a flaw in the working, the solution is reworked and re-reviewed
        until they agree.
        {grouped.size > 0 && (
          <>
            {' '}
            Today: <strong className="text-foreground">{totalRounds}</strong>{' '}
            {totalRounds === 1 ? 'round' : 'rounds'} across {grouped.size}{' '}
            {grouped.size === 1 ? 'question' : 'questions'}
            {reworkedCount > 0 && `, ${reworkedCount} reworked`}.
          </>
        )}
      </p>

      {error && <div className="mb-3 rounded-xl bg-callout-danger px-3 py-2 text-sm text-callout-danger-text">{error}</div>}
      {notice && (
        <div className="mb-3 rounded-xl bg-callout-success px-3 py-2 text-sm text-callout-success-text">{notice}</div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="neutral" size="sm" disabled={running !== null || !ready} onClick={() => run(false)}>
          {running === 'review' || !ready ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldQuestion className="h-4 w-4" />
          )}
          {!ready ? 'Loading…' : running === 'review' ? 'Reviewing…' : 'Review only'}
        </Button>

        <Button variant="action" size="sm" disabled={running !== null || !ready} onClick={() => run(true)}>
          {running === 'rework' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
          {running === 'rework' ? 'Reworking…' : 'Rework flagged solutions'}
        </Button>
      </div>

      {/* Stated rather than implied: this section can rewrite a solution, and
          the one thing an admin needs to be sure of is that it will not swap a
          question out from under a student mid-solve. */}
      <p className="mb-4 text-xs font-bold text-text-muted">
        Neither button changes a question. Reworking updates the working and the worked answer only — to
        change a question, use Swap for another above.
      </p>

      {grouped.size === 0 ? (
        <div className="shadow-card rounded-2xl bg-surface p-6 text-center text-sm text-text-muted">
          No reviews recorded for today yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...grouped.entries()].map(([questionId, rounds]) => (
            <QuestionLoop key={questionId} rounds={rounds} />
          ))}
        </div>
      )}
    </section>
  );
}
