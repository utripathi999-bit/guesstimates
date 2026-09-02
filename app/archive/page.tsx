'use client';

import { CheckCircle2, Circle, Globe2, MapPin, Search, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { guesstimates } from '@/lib/dailyPicker';
import { useStreakData } from '@/lib/streakStorage';
import type {
  GuesstimateApproach,
  GuesstimateCategory,
  GuesstimateDifficulty,
  GuesstimateRegion,
  QuestionStatus,
} from '@/lib/types';

const CATEGORIES: GuesstimateCategory[] = ['Market Sizing', 'Volume Estimation', 'Revenue Estimation', 'Infrastructure & Operations'];
const REGIONS: GuesstimateRegion[] = ['India', 'Global'];
const DIFFICULTIES: GuesstimateDifficulty[] = ['Beginner', 'Intermediate', 'Advanced'];
const APPROACHES: GuesstimateApproach[] = ['Top-Down', 'Bottom-Up', 'Supply-Side', 'Demand-Side'];

const STATUS_META: Record<QuestionStatus, { icon: typeof Circle; className: string }> = {
  Unsolved: { icon: Circle, className: 'bg-[#ececec] text-[#5c5c5c]' },
  'In Progress': { icon: Sparkles, className: 'bg-[#fff4cc] text-accent-dark' },
  Completed: { icon: CheckCircle2, className: 'bg-[#d1fae5] text-factual-dark' },
};

function FilterChip<T extends string>({
  value,
  active,
  onClick,
}: {
  value: T;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border-2 px-3 py-1.5 text-xs font-extrabold transition-colors
        ${active ? 'border-primary bg-[#e3f8cc] text-primary-dark' : 'border-surface-border bg-surface text-text-muted hover:border-primary/50'}`}
    >
      {value}
    </button>
  );
}

export default function ArchivePage() {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<GuesstimateRegion | null>(null);
  const [category, setCategory] = useState<GuesstimateCategory | null>(null);
  const [difficulty, setDifficulty] = useState<GuesstimateDifficulty | null>(null);
  const [approach, setApproach] = useState<GuesstimateApproach | null>(null);
  const streak = useStreakData();

  const statuses = useMemo<Record<string, QuestionStatus>>(() => {
    const map: Record<string, QuestionStatus> = {};
    for (const g of guesstimates) {
      if (streak.completedQuestionIds.includes(g.id)) map[g.id] = 'Completed';
      else if (streak.inProgressIds.includes(g.id)) map[g.id] = 'In Progress';
      else map[g.id] = 'Unsolved';
    }
    return map;
  }, [streak.completedQuestionIds, streak.inProgressIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return guesstimates.filter((g) => {
      if (region && g.region !== region) return false;
      if (category && g.category !== category) return false;
      if (difficulty && g.difficulty !== difficulty) return false;
      if (approach && g.approach !== approach) return false;
      if (q) {
        const haystack = `${g.title} ${g.category} ${g.region} ${g.difficulty} ${g.approach}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [search, region, category, difficulty, approach]);

  const hasActiveFilters = region || category || difficulty || approach || search;

  function clearFilters() {
    setSearch('');
    setRegion(null);
    setCategory(null);
    setDifficulty(null);
    setApproach(null);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <p className="text-xs font-black uppercase tracking-wider text-action-dark">Practice Library</p>
      <h1 className="text-display mb-1 text-3xl font-black text-foreground">Archive</h1>
      <p className="mb-6 text-text-muted">Browse and practice every guesstimate in the dataset.</p>

      <div className="shadow-card relative mb-4 rounded-2xl">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search titles, categories, approaches..."
          className="w-full rounded-2xl bg-surface py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-action"
        />
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {REGIONS.map((r) => (
          <FilterChip key={r} value={r} active={region === r} onClick={() => setRegion(region === r ? null : r)} />
        ))}
        {DIFFICULTIES.map((d) => (
          <FilterChip key={d} value={d} active={difficulty === d} onClick={() => setDifficulty(difficulty === d ? null : d)} />
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <FilterChip key={c} value={c} active={category === c} onClick={() => setCategory(category === c ? null : c)} />
        ))}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {APPROACHES.map((a) => (
          <FilterChip key={a} value={a} active={approach === a} onClick={() => setApproach(approach === a ? null : a)} />
        ))}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold text-danger-dark hover:bg-black/5"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      <p className="mb-3 text-sm font-bold text-text-muted">
        {filtered.length} question{filtered.length === 1 ? '' : 's'}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((g) => {
          const status = statuses[g.id] ?? 'Unsolved';
          const StatusIcon = STATUS_META[status].icon;
          return (
            <Link key={g.id} href={`/guesstimate/${g.id}`}>
              <Card interactive className="flex h-full flex-col gap-3 overflow-hidden !p-0">
                <div className={`h-1.5 w-full bg-gradient-to-r ${g.region === 'India' ? 'from-primary to-primary-dark' : 'from-action to-action-dark'}`} />
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-center justify-between">
                    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${STATUS_META[status].className}`}>
                      <StatusIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
                      {status}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold text-text-muted">
                      {g.region === 'India' ? <MapPin className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
                      {g.region}
                    </span>
                  </div>
                  <p className="flex-1 font-black text-foreground">{g.title}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="primary">{g.category}</Badge>
                    <Badge tone="action">{g.difficulty}</Badge>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="shadow-card mt-8 rounded-2xl bg-surface p-8 text-center text-text-muted">
          No guesstimates match these filters.
        </div>
      )}
    </main>
  );
}
