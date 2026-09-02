'use client';

import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SwipeCard } from '@/components/SwipeCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import factsData from '@/data/factsFlashcards.json';
import { setFlashcardMastery } from '@/lib/streakStorage';
import type { FactCategory, FactFlashcard, GuesstimateRegion } from '@/lib/types';

const facts = factsData as FactFlashcard[];
const CATEGORIES: FactCategory[] = ['Demographics', 'Digital & Tech', 'Urban & Mobility', 'Retail & Economy'];
const REGIONS: GuesstimateRegion[] = ['India', 'Global'];

export default function FlashcardsPage() {
  const [category, setCategory] = useState<FactCategory | null>(null);
  const [region, setRegion] = useState<GuesstimateRegion | null>(null);
  const [deckKey, setDeckKey] = useState(0);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ known: number; revision: number }>({ known: 0, revision: 0 });

  const deck = useMemo(() => {
    return facts.filter((f) => (category ? f.category === category : true) && (region ? f.region === region : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, region, deckKey]);

  const current = deck.slice(index, index + 3);
  const finished = deck.length > 0 && index >= deck.length;

  function handleSwipe(direction: 'left' | 'right') {
    const fact = deck[index];
    if (fact) {
      setFlashcardMastery(fact.id, direction === 'right' ? 'known' : 'revision');
      setResults((r) => ({
        known: r.known + (direction === 'right' ? 1 : 0),
        revision: r.revision + (direction === 'left' ? 1 : 0),
      }));
    }
    setIndex((i) => i + 1);
  }

  function restart() {
    setIndex(0);
    setResults({ known: 0, revision: 0 });
    setDeckKey((k) => k + 1);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-8">
      <h1 className="mb-1 text-2xl font-extrabold text-foreground">Fact Flashcards</h1>
      <p className="mb-5 text-center text-text-muted">Swipe right if you knew it, left if you need revision.</p>

      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => {
              setRegion(region === r ? null : r);
              restart();
            }}
            className={`rounded-full border-2 px-3 py-1.5 text-xs font-extrabold transition-colors
              ${region === r ? 'border-primary bg-[#e3f8cc] text-primary-dark' : 'border-surface-border bg-surface text-text-muted'}`}
          >
            {r}
          </button>
        ))}
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => {
              setCategory(category === c ? null : c);
              restart();
            }}
            className={`rounded-full border-2 px-3 py-1.5 text-xs font-extrabold transition-colors
              ${category === c ? 'border-action bg-[#d3eefd] text-action-dark' : 'border-surface-border bg-surface text-text-muted'}`}
          >
            {c}
          </button>
        ))}
      </div>

      <p className="mb-3 text-sm font-bold text-text-muted">
        {Math.min(index + 1, deck.length)} / {deck.length}
      </p>

      <div className="relative h-[420px] w-full max-w-sm" key={deckKey}>
        {deck.length === 0 && (
          <div className="flex h-full items-center justify-center rounded-3xl border-2 border-surface-border bg-surface text-text-muted">
            No flashcards match this filter.
          </div>
        )}

        {!finished &&
          current
            .slice()
            .reverse()
            .map((fact, i) => {
              const stackPos = current.length - 1 - i;
              const isTop = stackPos === 0;
              return (
                <div
                  key={fact.id}
                  className="absolute inset-0"
                  style={{
                    transform: isTop ? undefined : `scale(${1 - stackPos * 0.04}) translateY(${stackPos * 10}px)`,
                  }}
                >
                  <SwipeCard fact={fact} onSwipe={handleSwipe} zIndex={10 - stackPos} isTop={isTop} />
                </div>
              );
            })}

        {finished && (
          <div className="animate-pop flex h-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-surface-border bg-surface p-6 text-center">
            <Badge tone="primary">Deck Complete</Badge>
            <div className="flex gap-6">
              <div className="flex flex-col items-center gap-1">
                <CheckCircle2 className="h-8 w-8 text-factual" strokeWidth={2.5} />
                <span className="text-xl font-extrabold text-foreground">{results.known}</span>
                <span className="text-xs text-text-muted">Knew it</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <XCircle className="h-8 w-8 text-danger" strokeWidth={2.5} />
                <span className="text-xl font-extrabold text-foreground">{results.revision}</span>
                <span className="text-xs text-text-muted">To revise</span>
              </div>
            </div>
            <Button variant="primary" onClick={restart}>
              <RotateCcw className="h-4 w-4" />
              Go Again
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
