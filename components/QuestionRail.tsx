'use client';

import { Bookmark, BookmarkCheck, ChevronDown, Globe2, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Guesstimate } from '@/lib/types';

interface QuestionRailProps {
  guesstimate: Guesstimate;
  bookmarked: boolean;
  onToggleBookmark: () => void;
}

/**
 * Keeps the question in view for the whole session — the thing you're actually
 * solving shouldn't scroll away while you work.
 *
 * One element, two behaviours: below lg it's a compact sticky strip pinned
 * under the navbar with the title clamped to one line (tap to expand); at lg
 * and up it's a sticky side rail showing everything at once. Sticky rather
 * than fixed so it stays in normal document flow — the navbar's backdrop-blur
 * already makes it a containing block for fixed descendants, which would
 * trap a fixed rail inside the header.
 */
export function QuestionRail({ guesstimate, bookmarked, onToggleBookmark }: QuestionRailProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      className="sticky top-[var(--navbar-height)] z-30 -mx-4 mb-4 bg-background/95 px-4 py-3 backdrop-blur
        lg:top-[calc(var(--navbar-height)+1.5rem)] lg:z-auto lg:mx-0 lg:mb-0 lg:rounded-2xl lg:bg-surface
        lg:px-5 lg:py-5 lg:shadow-card lg:backdrop-blur-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 hidden text-xs font-black uppercase tracking-wider text-primary-dark lg:block">
            You&apos;re solving
          </p>
          <h1
            className={`text-display font-black leading-snug text-foreground
              ${expanded ? '' : 'line-clamp-1'} text-base lg:line-clamp-none lg:text-xl`}
          >
            {guesstimate.title}
          </h1>
        </div>

        <button
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? 'Collapse question' : 'Expand question'}
          aria-expanded={expanded}
          className="shrink-0 rounded-full p-1 text-text-muted hover:bg-black/5 lg:hidden"
        >
          <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        <button
          onClick={onToggleBookmark}
          aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
          className={`hidden shrink-0 rounded-full p-2 transition-colors lg:block
            ${bookmarked ? 'bg-[#fff4cc] text-accent-dark' : 'text-accent-dark hover:bg-black/5'}`}
        >
          {bookmarked ? <BookmarkCheck className="h-5 w-5" fill="currentColor" /> : <Bookmark className="h-5 w-5" />}
        </button>
      </div>

      {/* States the target outright — a title like "annual sales" is ambiguous
          between rupees and units, and the student shouldn't have to guess
          which one they're being asked for. */}
      {guesstimate.answer && (
        <div className={`mt-3 rounded-xl bg-callout-info px-3 py-2 ${expanded ? 'block' : 'hidden'} lg:block`}>
          <p className="text-[0.65rem] font-black uppercase tracking-wider text-callout-info-text opacity-80">
            Estimate this
          </p>
          <p className="text-sm font-bold leading-snug text-callout-info-text">{guesstimate.answer.label}</p>
          <p className="font-formula mt-1 text-xs font-black text-callout-info-text opacity-80">
            in {guesstimate.answer.unit}
          </p>
        </div>
      )}

      <div className={`mt-3 flex-wrap items-center gap-2 ${expanded ? 'flex' : 'hidden'} lg:flex`}>
        <Badge tone="primary">{guesstimate.category}</Badge>
        <Badge tone="action">{guesstimate.difficulty}</Badge>
        <Badge tone="neutral">{guesstimate.approach}</Badge>
        <span className="flex items-center gap-1 text-xs font-bold text-text-muted">
          {guesstimate.region === 'India' ? <MapPin className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
          {guesstimate.region}
        </span>
        <button
          onClick={onToggleBookmark}
          aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
          className={`rounded-full p-1.5 transition-colors lg:hidden
            ${bookmarked ? 'bg-[#fff4cc] text-accent-dark' : 'text-accent-dark hover:bg-black/5'}`}
        >
          {bookmarked ? <BookmarkCheck className="h-4 w-4" fill="currentColor" /> : <Bookmark className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
