import { useSyncExternalStore } from 'react';

/**
 * Per-device preferences only: bookmarks, scratchpad drafts, flashcard
 * mastery. Scored progress (points, streak, which questions are solved) lives
 * on the server in lib/progress.ts — keeping it here made it per-device and
 * client-reported, which is exactly what broke cross-device sync.
 */
import type { StreakData } from '@/lib/types';

const STORAGE_KEY = 'guesstimateDaily:v1';

const STARTING_FREEZES = 1;

const DEFAULT_STATE: StreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastCompletedDate: null,
  totalCompleted: 0,
  xp: 0,
  freezesAvailable: STARTING_FREEZES,
  freezesUsedDates: [],
  completedQuestionIds: [],
  attemptedQuestionIds: [],
  bookmarkedIds: [],
  inProgressIds: [],
  scratchpadNotes: {},
  flashcardMastery: {},
  dailyCompletionDates: [],
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function getStreakData(): StreakData {
  if (!isBrowser()) return { ...DEFAULT_STATE };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<StreakData>) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveStreakData(data: StreakData): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  // 'storage' only fires in *other* tabs — dispatch a same-tab event so UI (e.g. Navbar) updates immediately.
  window.dispatchEvent(new Event('guesstimate:updated'));
}

export function toggleBookmark(questionId: string): StreakData {
  const data = getStreakData();
  data.bookmarkedIds = data.bookmarkedIds.includes(questionId)
    ? data.bookmarkedIds.filter((id) => id !== questionId)
    : [...data.bookmarkedIds, questionId];
  saveStreakData(data);
  return data;
}

export function isBookmarked(questionId: string): boolean {
  return getStreakData().bookmarkedIds.includes(questionId);
}

export function saveScratchpadNote(questionId: string, note: string): void {
  const data = getStreakData();
  data.scratchpadNotes[questionId] = note;
  saveStreakData(data);
}

export function getScratchpadNote(questionId: string): string {
  return getStreakData().scratchpadNotes[questionId] ?? '';
}

export function setFlashcardMastery(factId: string, status: 'known' | 'revision'): StreakData {
  const data = getStreakData();
  data.flashcardMastery[factId] = status;
  saveStreakData(data);
  return data;
}

export function getFlashcardMastery(factId: string): 'known' | 'revision' | undefined {
  return getStreakData().flashcardMastery[factId];
}

// --- React binding -----------------------------------------------------
// useSyncExternalStore keeps components in sync with the localStorage-backed
// streak record (across same-tab writes and other-tab 'storage' events)
// without hand-rolled effect+setState wiring, and it's hydration-safe by
// design: React uses getServerSnapshot for the SSR/first-hydration pass and
// only switches to the real client snapshot once mounted.

let cachedRaw: string | null = null;
let cachedSnapshot: StreakData = DEFAULT_STATE;

function readCachedSnapshot(): StreakData {
  if (!isBrowser()) return DEFAULT_STATE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSnapshot = raw ? { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<StreakData>) } : { ...DEFAULT_STATE };
    } catch {
      cachedSnapshot = { ...DEFAULT_STATE };
    }
  }
  return cachedSnapshot;
}

function getServerSnapshot(): StreakData {
  return DEFAULT_STATE;
}

function subscribeToStreakChanges(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener('guesstimate:updated', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('guesstimate:updated', callback);
  };
}

/** Live-updating view of the streak record — re-renders on any local or cross-tab change. */
export function useStreakData(): StreakData {
  return useSyncExternalStore(subscribeToStreakChanges, readCachedSnapshot, getServerSnapshot);
}
