/**
 * Pure streak arithmetic, deliberately free of Redis or any other I/O so it can
 * be exercised directly.
 *
 * It lives apart from lib/progress.ts because of the bug it exists to prevent:
 * the streak was only ever recomputed when someone solved something, so a
 * stored value sat there being displayed — on the Today page and, worse, on the
 * leaderboard where it is a ranking tiebreak — long after the student had
 * stopped showing up. Making the rule a small pure function means it can be
 * asserted against real dates rather than reasoned about.
 */

/** Days between two YYYY-MM-DD strings (b - a), parsed at UTC noon to sidestep DST edges. */
export function daysBetween(a: string, b: string): number {
  const dateA = new Date(`${a}T12:00:00Z`).getTime();
  const dateB = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((dateB - dateA) / (1000 * 60 * 60 * 24));
}

/**
 * The streak as of `todayStr`, rather than the number last written to storage.
 *
 * A streak is a claim about *now* — "you have shown up every day up to today".
 * So the stored value is treated as "the streak as of lastCompletedDate", and
 * the live answer is derived on every read. Solving today keeps it; solving
 * yesterday keeps it, because today is not over yet; anything older is gone.
 */
export function effectiveStreak(
  storedStreak: number,
  lastCompletedDate: string | null,
  todayStr: string
): number {
  if (!lastCompletedDate || storedStreak <= 0) return 0;
  return daysBetween(lastCompletedDate, todayStr) <= 1 ? storedStreak : 0;
}
