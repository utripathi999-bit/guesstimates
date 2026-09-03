'use client';

import { ChevronDown, HelpCircle, Loader2, MessageCircleQuestion, Send } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { extractApiErrorMessage } from '@/lib/apiError';

export interface ClarificationPair {
  question: string;
  answer: string;
}

interface ClarifyingQuestionsProps {
  guesstimateId: string;
  suggestedQuestions: string[];
  /**
   * Reports settled scoping upward so the hint and feedback tools know what
   * the interviewer has already told this candidate.
   */
  onClarificationsChange?: (pairs: ClarificationPair[]) => void;
}

interface ThreadEntry {
  id: string;
  question: string;
  answer?: string;
  errorMessage?: string;
  status: 'loading' | 'done' | 'error';
}

// Module scope, not component scope: React Compiler's purity check flags
// Date.now()/Math.random() calls written anywhere lexically inside a
// component body, even nested in an event handler that only ever runs from
// a click — pulling id generation out here sidesteps that entirely.
function generateThreadEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ClarifyingQuestions({
  guesstimateId,
  suggestedQuestions,
  onClarificationsChange,
}: ClarifyingQuestionsProps) {
  const [open, setOpen] = useState(true);
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);

  const askedQuestions = new Set(thread.map((t) => t.question));

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || asking) return;

    const id = generateThreadEntryId();
    const history = thread.filter((t) => t.status === 'done').map((t) => ({ question: t.question, answer: t.answer ?? '' }));

    setThread((prev) => [...prev, { id, question: trimmed, status: 'loading' }]);
    setDraft('');
    setAsking(true);

    try {
      const res = await fetch('/api/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guesstimateId, question: trimmed, history }),
      });
      if (!res.ok) {
        const errorMessage = await extractApiErrorMessage(res, "Couldn't reach the interviewer — try again.");
        setThread((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'error', errorMessage } : t)));
        return;
      }
      const data: { answer?: string } = await res.json();
      const answer = data.answer ?? "I don't have an answer for that.";
      setThread((prev) => prev.map((t) => (t.id === id ? { ...t, answer, status: 'done' as const } : t)));

      // Computed outside the updater — a state updater must stay pure, and
      // everything needed is already in scope.
      onClarificationsChange?.([
        ...thread
          .filter((entry) => entry.status === 'done' && entry.answer)
          .map((entry) => ({ question: entry.question, answer: entry.answer as string })),
        { question: trimmed, answer },
      ]);
    } catch {
      setThread((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'error' } : t)));
    } finally {
      setAsking(false);
    }
  }

  return (
    <Card className="mb-6">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2 font-black text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#d3eefd] text-action-dark">
            <HelpCircle className="h-4 w-4" strokeWidth={2.5} />
          </span>
          Clarifying Questions
        </span>
        <ChevronDown className={`h-5 w-5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="animate-slide-up mt-3 flex flex-col gap-3">
          <p className="text-xs text-text-muted">
            Ask the interviewer to scope the problem before you estimate — just like a real case interview. Pick a
            prompt below or type your own.
          </p>

          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                disabled={asking || askedQuestions.has(q)}
                className="rounded-full border border-action/30 bg-callout-info px-3 py-1.5 text-xs font-bold text-callout-info-text transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>

          {thread.length > 0 && (
            <div className="flex flex-col gap-3">
              {thread.map((t) => (
                <div key={t.id} className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 rounded-full bg-[#e3f8cc] px-2 py-0.5 text-[10px] font-black uppercase text-primary-dark">
                      You
                    </span>
                    <p className="text-sm font-bold text-foreground">{t.question}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 rounded-full bg-[#d3eefd] px-2 py-0.5 text-[10px] font-black uppercase text-action-dark">
                      Interviewer
                    </span>
                    {t.status === 'loading' && (
                      <span className="flex items-center gap-1.5 text-sm text-text-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Thinking...
                      </span>
                    )}
                    {t.status === 'done' && <p className="text-sm text-foreground">{t.answer}</p>}
                    {t.status === 'error' && (
                      <p className="text-sm text-callout-danger-text">
                        {t.errorMessage ?? "Couldn't reach the interviewer — try again."}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <MessageCircleQuestion className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask your own scoping question..."
                disabled={asking}
                className="w-full rounded-xl bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-action disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={asking || !draft.trim()}
              aria-label="Ask"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-action text-white shadow-[0_6px_14px_-4px_hsl(199_96%_50%/0.5)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2.5} />}
            </button>
          </form>
        </div>
      )}
    </Card>
  );
}
