'use client';

import { motion } from 'framer-motion';
import { Loader2, Lock, Target, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { extractApiErrorMessage } from '@/lib/apiError';
import { formatIndian, formatRatio, parseEstimate, type Accuracy, type AccuracyBand } from '@/lib/estimateMath';
import type { AnswerSpec } from '@/lib/types';

export interface SubmittedEstimate {
  yourValue: number;
  actual: number | null;
  accuracy: Accuracy | null;
  batch: { count: number; median: number | null };
}

interface EstimateGateProps {
  questionId: string;
  answer: AnswerSpec;
  /** Fires once the estimate is committed, so the parent can reveal the solution. */
  onCommitted: (submitted: SubmittedEstimate) => void;
}

/**
 * Nothing here is styled as an error. Being 10x out on a first pass is a normal
 * and useful result in a guesstimate — it means one assumption is carrying the
 * gap, not that the attempt failed, and the colours shouldn't imply otherwise.
 */
const BAND_STYLES: Record<AccuracyBand, string> = {
  excellent: 'bg-callout-success text-callout-success-text',
  strong: 'bg-callout-success text-callout-success-text',
  ballpark: 'bg-callout-info text-callout-info-text',
  off: 'bg-callout-warn text-callout-warn-text',
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 text-center">
      <p className="text-[0.65rem] font-black uppercase tracking-wider text-text-muted">{label}</p>
      <p className="font-formula mt-0.5 truncate text-lg font-black tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[0.65rem] font-bold text-text-muted">{sub}</p>}
    </div>
  );
}

/** The committed number, the worked answer, and where the rest of the batch landed. */
export function EstimateResult({ answer, submitted }: { answer: AnswerSpec; submitted: SubmittedEstimate }) {
  const { accuracy, batch } = submitted;

  return (
    <div className="shadow-card mb-6 overflow-hidden rounded-2xl bg-surface">
      {accuracy && (
        <div className={`px-5 py-4 ${BAND_STYLES[accuracy.band]}`}>
          <p className="flex flex-wrap items-center gap-2 font-black">
            {accuracy.label}
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs tabular-nums">
              {formatRatio(accuracy.ratio)}
            </span>
          </p>
          <p className="mt-1 text-sm font-medium opacity-90">{accuracy.note}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 px-4 py-4">
        <Stat label="You said" value={formatIndian(submitted.yourValue)} />
        <Stat label="Worked answer" value={submitted.actual === null ? '—' : formatIndian(submitted.actual)} />
        <Stat
          label="Batch median"
          value={batch.median === null ? '—' : formatIndian(batch.median)}
          sub={batch.count > 1 ? `${batch.count} in` : undefined}
        />
      </div>

      <p className="flex items-center justify-center gap-1.5 border-t border-surface-border px-4 py-2 text-center text-xs font-bold text-text-muted">
        <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
        {batch.count <= 1
          ? 'You are the first in the batch to commit a number on this one.'
          : `${batch.count} students have committed a number · all figures in ${answer.unit}`}
      </p>
    </div>
  );
}

/**
 * Looks up any estimate this student already committed for a question.
 *
 * Lives here rather than inside the gate because it has to run even when the
 * gate isn't rendered — on a question they finished earlier, the stored
 * estimate is exactly what the result strip needs.
 */
export function useSubmittedEstimate(questionId: string) {
  const [submitted, setSubmitted] = useState<SubmittedEstimate | null>(null);
  const [restoring, setRestoring] = useState(true);

  const restore = useCallback(async () => {
    try {
      const res = await fetch(`/api/estimate?questionId=${encodeURIComponent(questionId)}`);
      const data: { submitted: SubmittedEstimate | null } = await res.json();
      if (data.submitted) setSubmitted(data.submitted);
    } catch {
      // Offline or signed out: fall through to the input, nothing is lost.
    } finally {
      setRestoring(false);
    }
  }, [questionId]);

  useEffect(() => {
    // A previous commitment can only come from the network, so there is
    // nothing to derive during render — look it up on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    restore();
  }, [restore]);

  return { submitted, setSubmitted, restoring };
}

export function EstimateGate({ questionId, answer, onCommitted }: EstimateGateProps) {
  const [raw, setRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseEstimate(raw, answer.unit);
  const touched = raw.trim() !== '';

  async function handleSubmit() {
    if (!parsed.ok) {
      setError(parsed.error ?? 'Enter your estimate to continue.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, value: parsed.value }),
      });
      if (!res.ok) {
        setError(await extractApiErrorMessage(res, 'Could not save your estimate.'));
        return;
      }
      const data: { submitted: SubmittedEstimate } = await res.json();
      onCommitted(data.submitted);
    } catch {
      setError('Could not save your estimate.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="shadow-card mb-6 rounded-2xl bg-surface p-5"
    >
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary-dark">
        <Target className="h-3.5 w-3.5" strokeWidth={3} />
        Commit your estimate
      </p>
      <p className="mt-1 font-black leading-snug text-foreground">{answer.label}</p>

      <div className="mt-4 flex items-stretch overflow-hidden rounded-xl bg-background ring-1 ring-inset ring-surface-border focus-within:ring-2 focus-within:ring-action">
        <input
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && parsed.ok && !saving) handleSubmit();
          }}
          inputMode="decimal"
          autoComplete="off"
          disabled={saving}
          aria-label={`${answer.label}, in ${answer.unit}`}
          placeholder="Your number"
          className="font-formula min-w-0 flex-1 bg-transparent px-4 py-3 text-lg font-black tabular-nums text-foreground outline-none placeholder:font-bold placeholder:text-text-muted"
        />
        <span className="flex shrink-0 items-center border-l border-surface-border px-3 text-sm font-bold text-text-muted">
          {answer.unit}
        </span>
      </div>

      {/* Echoing the number back with Indian grouping makes a stray zero obvious
          before it is locked in — the most common way these go wrong. */}
      <p className="mt-2 min-h-[1.25rem] text-sm font-bold">
        {error ? (
          <span className="text-callout-danger-text">{error}</span>
        ) : parsed.ok ? (
          <span className="text-text-muted">
            = {formatIndian(parsed.value)} {answer.unit}
          </span>
        ) : null}
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="accent"
          size="lg"
          onClick={handleSubmit}
          disabled={!parsed.ok || saving}
          className="w-full sm:w-auto"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
          {saving ? 'Locking in…' : 'Lock in & reveal solution'}
        </Button>
        <p className="text-xs font-bold text-text-muted sm:max-w-[15rem] sm:text-right">
          {touched
            ? 'Locked once submitted — this is the number compared against the batch.'
            : 'The worked solution unlocks as soon as you commit a number.'}
        </p>
      </div>
    </motion.div>
  );
}
