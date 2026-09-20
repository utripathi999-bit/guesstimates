'use client';

import { AlertTriangle, CheckCircle2, Loader2, MinusCircle, ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { extractApiErrorMessage } from '@/lib/apiError';
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
  attempt: number;
  skipReason?: string;
  checkedAt: string;
}

const VERDICT_STYLES = {
  accept: { label: 'Accepted', className: 'bg-callout-success text-callout-success-text', Icon: CheckCircle2 },
  reject: { label: 'Rejected', className: 'bg-callout-warn text-callout-warn-text', Icon: AlertTriangle },
  skipped: { label: 'Not reviewed', className: 'bg-callout-info text-callout-info-text', Icon: MinusCircle },
} as const;

function Figure({ label, value, unit }: { label: string; value: number | null | undefined; unit?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.65rem] font-black uppercase tracking-wider text-text-muted">{label}</p>
      <p className="font-formula truncate text-sm font-black tabular-nums text-foreground">
        {value === null || value === undefined ? '—' : formatIndian(value)}
        {unit && value !== null && value !== undefined && (
          <span className="ml-1 text-[0.65rem] font-bold text-text-muted">{unit}</span>
        )}
      </p>
    </div>
  );
}

export function CritiqueCard({ critique }: { critique: CritiqueView }) {
  const style = VERDICT_STYLES[critique.verdict];

  return (
    <div className="shadow-card overflow-hidden rounded-2xl bg-surface">
      <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${style.className}`}>
        <style.Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        <span className="text-sm font-black">{style.label}</span>
        {critique.ratio !== null && (
          <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-black tabular-nums">
            {critique.ratio < 10 ? critique.ratio.toFixed(1) : Math.round(critique.ratio)}× apart
          </span>
        )}
        {critique.attempt > 1 && (
          <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-bold">attempt {critique.attempt}</span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm font-black leading-snug text-foreground">{critique.title}</p>

        {critique.skipReason ? (
          <p className="text-sm text-text-muted">{critique.skipReason}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Figure label="Question says" value={critique.statedAnswer} unit={critique.unit} />
              <Figure label="Critic's own answer" value={critique.independentEstimate} unit={critique.unit} />
            </div>

            {critique.method && (
              <p className="text-xs text-text-muted">
                <span className="font-black uppercase tracking-wider">Its route:</span> {critique.method}
              </p>
            )}

            {critique.reasoning && <p className="text-sm text-text-muted">{critique.reasoning}</p>}

            {critique.concerns && critique.concerns.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {critique.concerns.map((concern, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-callout-warn-text">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                    {concern}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The admin's view of what the critic did, plus a way to run it by hand.
 *
 * The manual run matters more than it looks: during normal generation you only
 * ever see the question that survived, so there is no way to tell a question
 * nobody objected to from one that passed because the critic was unavailable.
 * Pointing it at a question you already believe is wrong is the check.
 */
export function CritiqueReport({ initial, questionIds }: { initial: CritiqueView[]; questionIds: string[] }) {
  const [critiques, setCritiques] = useState(initial);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(questionId: string) {
    setRunningId(questionId);
    setError(null);
    try {
      const res = await fetch('/api/admin/critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId }),
      });
      if (!res.ok) {
        setError(await extractApiErrorMessage(res, 'Could not run the critic.'));
        return;
      }
      const data: { critique: CritiqueView } = await res.json();
      setCritiques((prev) => [data.critique, ...prev.filter((c) => c.questionId !== data.critique.questionId)]);
    } catch {
      setError('Could not run the critic.');
    } finally {
      setRunningId(null);
    }
  }

  return (
    <section className="mb-10">
      <h2 className="text-display flex items-center gap-2 text-2xl font-black text-foreground">
        <ShieldQuestion className="h-5 w-5 text-assumed-dark" strokeWidth={2.5} />
        Question review
      </h2>
      <p className="mb-4 mt-1 text-sm text-text-muted">
        Every generated question is re-derived independently before students see it. A question is rejected and
        regenerated when the critic&apos;s own answer is more than 3× away, or when it finds a structural flaw.
      </p>

      {error && <div className="mb-3 rounded-xl bg-callout-danger px-3 py-2 text-sm text-callout-danger-text">{error}</div>}

      <div className="mb-4 flex flex-wrap gap-2">
        {questionIds.map((id) => (
          <Button key={id} variant="neutral" size="sm" disabled={runningId !== null} onClick={() => run(id)}>
            {runningId === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldQuestion className="h-4 w-4" />}
            Re-check today&apos;s
          </Button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          placeholder="Any question id, e.g. daily-ecommerce-parcels-delhi-ncr"
          className="min-w-0 flex-1 rounded-xl bg-background px-3 py-2 text-sm text-foreground outline-none ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-action"
        />
        <Button
          variant="action"
          size="sm"
          disabled={runningId !== null || manualId.trim().length === 0}
          onClick={() => run(manualId.trim())}
        >
          {runningId === manualId.trim() ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Run critic
        </Button>
      </div>

      {critiques.length === 0 ? (
        <div className="shadow-card rounded-2xl bg-surface p-6 text-center text-sm text-text-muted">
          No reviews recorded for today yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {critiques.map((c, i) => (
            <CritiqueCard key={`${c.questionId}-${c.attempt}-${i}`} critique={c} />
          ))}
        </div>
      )}
    </section>
  );
}
