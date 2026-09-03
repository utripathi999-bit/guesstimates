'use client';

import { Loader2, PenLine, RefreshCw, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { extractApiErrorMessage } from '@/lib/apiError';

export interface AdminQuestionSummary {
  id: string;
  title: string;
  region: string;
  category?: string;
  difficulty: string;
}

interface AdminQuestionsProps {
  initialQuestions: AdminQuestionSummary[];
  initialSource: 'ai' | 'static';
  date: string;
}

type Busy = { kind: 'all' } | { kind: 'one'; id: string } | { kind: 'brief'; id: string } | null;

export function AdminQuestions({ initialQuestions, initialSource, date }: AdminQuestionsProps) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [source, setSource] = useState(initialSource);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [briefFor, setBriefFor] = useState<string | null>(null);
  const [brief, setBrief] = useState('');

  async function run(payload: Record<string, unknown>, busyState: Busy, successNote: (r: ResponseShape) => string) {
    setBusy(busyState);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await extractApiErrorMessage(res, 'Could not update the questions.'));
        return;
      }
      const data: ResponseShape = await res.json();
      setQuestions(data.questions);
      setSource('ai');
      setBriefFor(null);
      setBrief('');
      setNotice(successNote(data));
    } catch {
      setError('Could not update the questions.');
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <section className="mb-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-display text-2xl font-black text-foreground">Today&apos;s questions</h2>
        <Button
          variant="neutral"
          size="sm"
          disabled={disabled}
          onClick={() => run({ action: 'regenerateAll' }, { kind: 'all' }, () => 'Generated a fresh pair for today.')}
        >
          {busy?.kind === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Regenerate both
        </Button>
      </div>
      <p className="mb-4 text-sm text-text-muted">
        {date} · {source === 'ai' ? 'AI-generated' : 'fallback set — no AI questions stored for today'}. Changes take
        effect immediately for every student.
      </p>

      {error && <div className="mb-3 rounded-xl bg-callout-danger px-3 py-2 text-sm text-callout-danger-text">{error}</div>}
      {notice && (
        <div className="mb-3 rounded-xl bg-callout-success px-3 py-2 text-sm text-callout-success-text">{notice}</div>
      )}

      <ul className="flex flex-col gap-3">
        {questions.map((q) => (
          <li key={q.id} className="shadow-card flex flex-col gap-3 rounded-2xl bg-surface p-4">
            <div>
              <p className="font-black text-foreground">{q.title}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={q.region === 'India' ? 'primary' : 'action'}>{q.region}</Badge>
                <Badge tone="neutral">{q.difficulty}</Badge>
                {q.category && <Badge tone="neutral">{q.category}</Badge>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="neutral"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  run(
                    { action: 'replaceOne', questionId: q.id },
                    { kind: 'one', id: q.id },
                    (r) => `Swapped out "${r.replacedTitle ?? q.title}".`
                  )
                }
              >
                {busy?.kind === 'one' && busy.id === q.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shuffle className="h-4 w-4" />
                )}
                Swap for another
              </Button>

              <Button
                variant="neutral"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  setBriefFor(briefFor === q.id ? null : q.id);
                  setBrief('');
                  setError(null);
                }}
              >
                <PenLine className="h-4 w-4" />
                Use my own question
              </Button>
            </div>

            {briefFor === q.id && (
              <div className="animate-slide-up flex flex-col gap-2">
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={3}
                  maxLength={600}
                  placeholder="Write the question you want students to get, e.g. 'How many cups of filter coffee are sold in Chennai each day?'"
                  className="w-full resize-y rounded-xl bg-background p-3 text-sm text-foreground outline-none ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-action"
                />
                <p className="text-xs text-text-muted">
                  The interviewer will build the full solution, steps, clarifying questions and tips around it.
                </p>
                <div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={disabled || brief.trim().length < 10}
                    onClick={() =>
                      run(
                        { action: 'replaceWithBrief', questionId: q.id, brief: brief.trim() },
                        { kind: 'brief', id: q.id },
                        () => 'Built your question and swapped it in.'
                      )
                    }
                  >
                    {busy?.kind === 'brief' && busy.id === q.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PenLine className="h-4 w-4" />
                    )}
                    Build and swap in
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ResponseShape {
  questions: AdminQuestionSummary[];
  replacedTitle?: string;
}
