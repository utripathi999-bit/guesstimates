'use client';

import { AlertTriangle, CheckCircle2, ClipboardCheck, Lightbulb, Loader2, PenLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getScratchpadNote, saveScratchpadNote } from '@/lib/streakStorage';

interface ScratchpadProps {
  questionId: string;
}

interface Feedback {
  strengths: string[];
  gaps: string[];
}

export function Scratchpad({ questionId }: ScratchpadProps) {
  const [notes, setNotes] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Deliberate effect, not a derivable-during-render value: this seeds a
    // *locally editable* draft from localStorage after mount so SSR and the
    // first client render both show '' (hydration-safe), then hydrates in
    // the real draft. A lazy useState initializer would read localStorage
    // during the hydration render itself and mismatch the server markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(getScratchpadNote(questionId));
  }, [questionId]);

  function handleChange(value: string) {
    setNotes(value);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveScratchpadNote(questionId, value), 400);
  }

  async function handleAskHint() {
    setHintLoading(true);
    setHintError(null);
    try {
      const res = await fetch('/api/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guesstimateId: questionId, userNotes: notes }),
      });
      if (!res.ok) throw new Error('Hint service unavailable');
      const data: { hint?: string } = await res.json();
      setHint(data.hint ?? null);
    } catch {
      setHintError("Couldn't fetch a hint right now — keep structuring your own approach for now.");
    } finally {
      setHintLoading(false);
    }
  }

  async function handleGetFeedback() {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guesstimateId: questionId, userNotes: notes }),
      });
      if (!res.ok) throw new Error('Feedback service unavailable');
      const data: Feedback = await res.json();
      setFeedback(data);
    } catch {
      setFeedbackError("Couldn't get feedback right now — try again in a moment.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  const notesEmpty = notes.trim().length === 0;

  return (
    <div className="shadow-card rounded-2xl bg-surface p-5">
      <div className="mb-3 flex items-center gap-2 font-black text-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#d3eefd] text-action-dark">
          <PenLine className="h-4 w-4" strokeWidth={2.5} />
        </span>
        Try Your Own Estimate
      </div>
      <textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Jot down your structure: population base, key segments, assumptions, and your rough final number..."
        rows={6}
        className="w-full resize-y rounded-xl bg-background p-3 text-sm text-foreground outline-none ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-action"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="action" size="sm" onClick={handleAskHint} disabled={hintLoading} type="button">
          {hintLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
          Get a Hint
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleGetFeedback}
          disabled={feedbackLoading || notesEmpty}
          type="button"
          title={notesEmpty ? 'Write your approach first' : undefined}
        >
          {feedbackLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
          Get Feedback
        </Button>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        A hint nudges you toward the next specific thing to consider. Feedback critiques the full approach
        you&apos;ve written so far. Neither ever reveals the real numbers.
      </p>

      {hint && (
        <div className="animate-slide-up shadow-card mt-3 flex gap-2 rounded-xl bg-gradient-to-br from-[#fff9e6] to-[#fff0c2] p-3 text-sm text-[#7a5b00]">
          <Lightbulb className="h-4 w-4 shrink-0 translate-y-0.5" strokeWidth={2.5} />
          <p>{hint}</p>
        </div>
      )}
      {hintError && (
        <div className="animate-slide-up shadow-card mt-3 rounded-xl bg-[#fff0f0] p-3 text-sm text-danger-dark">
          {hintError}
        </div>
      )}

      {feedback && (
        <div className="animate-slide-up mt-3 flex flex-col gap-2">
          {feedback.strengths.length > 0 && (
            <div className="shadow-card flex flex-col gap-1.5 rounded-xl bg-gradient-to-br from-[#f0fdf6] to-[#e3f8cc] p-3 text-sm text-factual-dark">
              {feedback.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 translate-y-0.5" strokeWidth={2.5} />
                  <p>{s}</p>
                </div>
              ))}
            </div>
          )}
          {feedback.gaps.length > 0 && (
            <div className="shadow-card flex flex-col gap-1.5 rounded-xl bg-gradient-to-br from-[#fff0f0] to-[#ffe0e0] p-3 text-sm text-danger-dark">
              {feedback.gaps.map((g, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 translate-y-0.5" strokeWidth={2.5} />
                  <p>{g}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {feedbackError && (
        <div className="animate-slide-up shadow-card mt-3 rounded-xl bg-[#fff0f0] p-3 text-sm text-danger-dark">
          {feedbackError}
        </div>
      )}
    </div>
  );
}
