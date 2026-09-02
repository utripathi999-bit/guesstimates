import { useSyncExternalStore } from 'react';
import { getDailyGuesstimateIds, getLocalDateString } from '@/lib/dailyPicker';
import type { QuestionStatus, StreakData } from '@/lib/types';

const STORAGE_KEY = 'guesstimateDaily:v1';
const XP_PER_QUESTION = 20;
const XP_STREAK_BONUS = 30;
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

/** Days between two YYYY-MM-DD strings (b - a), parsed at UTC noon to sidestep DST edge cases. */
function daysBetween(a: string, b: string): number {
  const dateA = new Date(`${a}T12:00:00Z`).getTime();
  const dateB = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((dateB - dateA) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return getLocalDateString(d);
}

export interface CompletionResult {
  data: StreakData;
  dailyGoalJustCompleted: boolean;
  streakIncreased: boolean;
  freezeUsed: boolean;
}

/**
 * Marks a question completed, awards question XP, and — if this completes
 * both of today's daily questions for the first time — advances the streak,
 * consuming a freeze automatically if exactly one day was missed.
 */
export function markQuestionCompleted(questionId: string): CompletionResult {
  const data = getStreakData();
  const today = getLocalDateString();

  const alreadyCompleted = data.completedQuestionIds.includes(questionId);
  if (!alreadyCompleted) {
    data.completedQuestionIds.push(questionId);
    data.totalCompleted += 1;
    data.xp += XP_PER_QUESTION;
  }
  data.inProgressIds = data.inProgressIds.filter((id) => id !== questionId);

  let dailyGoalJustCompleted = false;
  let streakIncreased = false;
  let freezeUsed = false;

  const todaysIds = getDailyGuesstimateIds(new Date());
  const bothTodaysDone = todaysIds.every((id) => data.completedQuestionIds.includes(id));
  const alreadyCountedToday = data.lastCompletedDate === today;

  if (bothTodaysDone && !alreadyCountedToday) {
    dailyGoalJustCompleted = true;
    data.xp += XP_STREAK_BONUS;
    data.dailyCompletionDates.push(today);

    if (data.lastCompletedDate === null) {
      data.currentStreak = 1;
      streakIncreased = true;
    } else {
      const gap = daysBetween(data.lastCompletedDate, today);
      if (gap === 1) {
        data.currentStreak += 1;
        streakIncreased = true;
      } else if (gap === 2 && data.freezesAvailable > 0) {
        // Exactly one day was missed — auto-consume a streak freeze to bridge the gap.
        data.freezesAvailable -= 1;
        data.freezesUsedDates.push(addDays(data.lastCompletedDate, 1));
        data.currentStreak += 1;
        streakIncreased = true;
        freezeUsed = true;
      } else if (gap > 1) {
        data.currentStreak = 1;
      }
      // gap === 0 shouldn't happen given alreadyCountedToday check above.
    }

    data.longestStreak = Math.max(data.longestStreak, data.currentStreak);
    data.lastCompletedDate = today;
  }

  saveStreakData(data);
  return { data, dailyGoalJustCompleted, streakIncreased, freezeUsed };
}

export function markQuestionInProgress(questionId: string): StreakData {
  const data = getStreakData();
  if (!data.completedQuestionIds.includes(questionId) && !data.inProgressIds.includes(questionId)) {
    data.inProgressIds.push(questionId);
    saveStreakData(data);
  }
  return data;
}

export function getQuestionStatus(questionId: string): QuestionStatus {
  const data = getStreakData();
  if (data.completedQuestionIds.includes(questionId)) return 'Completed';
  if (data.inProgressIds.includes(questionId)) return 'In Progress';
  return 'Unsolved';
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

/** Whether the streak is "at risk" — both daily questions are still incomplete and it's not a fresh streak of 0. */
export function isStreakAtRisk(): boolean {
  const data = getStreakData();
  const today = getLocalDateString();
  if (data.currentStreak === 0 || data.lastCompletedDate === today) return false;
  const todaysIds = getDailyGuesstimateIds(new Date());
  return !todaysIds.every((id) => data.completedQuestionIds.includes(id));
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
