const STORAGE_KEY = 'guesstimateDaily:userId';

const ADJECTIVES = ['Sharp', 'Swift', 'Bold', 'Keen', 'Sly', 'Calm', 'Brisk', 'Wise'];
const NOUNS = ['Estimator', 'Analyst', 'Strategist', 'Consultant', 'Forecaster', 'Solver'];

function generateHandle(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${adjective}${noun}${suffix}`;
}

/** A stable, anonymous per-browser display name used only for the leaderboard — no auth involved. */
export function getAnonymousUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';

  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const handle = generateHandle();
  window.localStorage.setItem(STORAGE_KEY, handle);
  return handle;
}
