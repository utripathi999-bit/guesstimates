'use client';

import { Lightbulb, Loader2, PenLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getScratchpadNote, saveScratchpadNote } from '@/lib/streakStorage';

interface ScratchpadProps {
  questionId: string;
  questionTitle: string;
}

export function Scratchpad({ questionId, questionTitle }: ScratchpadProps) {
  const [notes, setNotes] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
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
        body: JSON.stringify({ questionTitle, userNotes: notes }),
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
        <span className="text-xs text-text-muted">Hints nudge your structure — they never reveal the answer.</span>
      </div>

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
    </div>
  );
}
