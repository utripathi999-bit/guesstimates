/**
 * Weekly leaderboard periods.
 *
 * The board resets every Sunday at 5:30 AM IST, which is exactly Sunday
 * 00:00 UTC — the same instant the daily question rotation happens. Working in
 * UTC therefore needs no timezone maths: a week is simply the seven UTC days
 * starting on a Sunday, and a week is identified by that Sunday's date string.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parsed at UTC noon so a date string never lands on a DST or rounding edge. */
function utcNoon(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

/** The Sunday that starts the week containing `dateStr`, as YYYY-MM-DD. */
export function getWeekStart(dateStr: string): string {
  const d = utcNoon(dateStr);
  // getUTCDay(): 0 = Sunday, so this is already the number of days to rewind.
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/** The exact instant the week containing `dateStr` ends and the board resets. */
export function getWeekResetAt(dateStr: string): Date {
  const start = utcNoon(getWeekStart(dateStr));
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()) + 7 * MS_PER_DAY);
}

/** e.g. "2 days left" — how long the current weekly board stays open. */
export function describeTimeLeft(resetAt: Date, now: Date = new Date()): string {
  const ms = resetAt.getTime() - now.getTime();
  if (ms <= 0) return 'resetting now';

  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'under an hour left';
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;

  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}
