/**
 * Parsing, formatting and accuracy banding for a student's committed estimate.
 *
 * Shared by the client (live echo and validation as they type) and the server
 * (which re-parses and re-bands rather than trusting anything the client sends).
 */

/** Characters students routinely paste in that aren't part of the number. */
const NOISE = /[,\s₹`'"]/g;

export interface ParsedEstimate {
  ok: boolean;
  value: number;
  /** Why it failed, ready to show under the input. */
  error?: string;
}

/**
 * Lenient about formatting, strict about scale words. "12,00,000" and "₹ 45.5"
 * parse fine, but "12 crore" is rejected — the unit already fixes the scale, and
 * silently reading that as 12 (or as 12,00,00,000) would be a guess either way.
 */
export function parseEstimate(raw: string, unit: string): ParsedEstimate {
  const cleaned = raw.replace(NOISE, '');
  if (cleaned === '') return { ok: false, value: NaN };

  if (/[a-zA-Z]/.test(cleaned)) {
    return { ok: false, value: NaN, error: `Enter just the number — the unit is already set to ${unit}.` };
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    return { ok: false, value: NaN, error: "That doesn't look like a number." };
  }
  if (value <= 0) {
    return { ok: false, value: NaN, error: 'Your estimate needs to be greater than zero.' };
  }
  return { ok: true, value };
}

/** Indian digit grouping (1,20,000), so a mis-typed zero is obvious at a glance. */
export function formatIndian(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const decimals = Number.isInteger(value) ? 0 : Math.min(2, (String(value).split('.')[1] ?? '').length);
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export type AccuracyBand = 'excellent' | 'strong' | 'ballpark' | 'off';

export interface Accuracy {
  band: AccuracyBand;
  /** How many times out from the worked answer, always >= 1. */
  ratio: number;
  label: string;
  note: string;
}

/**
 * Guesstimates are judged on order of magnitude, not decimal places — an
 * interviewer cares that you landed in the right region and can defend how you
 * got there. The bands say that out loud so a 3x miss doesn't read as a failure.
 */
export function scoreAccuracy(submitted: number, actual: number): Accuracy {
  const ratio = submitted > actual ? submitted / actual : actual / submitted;

  if (ratio <= 2) {
    return {
      band: 'excellent',
      ratio,
      label: 'Spot on',
      note: 'Inside 2× of the worked answer — in a real interview this lands as a confident, well-calibrated number.',
    };
  }
  if (ratio <= 5) {
    return {
      band: 'strong',
      ratio,
      label: 'Strong estimate',
      note: 'Comfortably the right order of magnitude. Compare your assumptions below to see which one moved you most.',
    };
  }
  if (ratio <= 10) {
    return {
      band: 'ballpark',
      ratio,
      label: 'Right ballpark',
      note: 'Same order of magnitude as the worked answer. Usually one assumption is carrying the whole gap — find it below.',
    };
  }
  return {
    band: 'off',
    ratio,
    label: 'Off the mark',
    note: 'More than 10× out, which almost always means one step, not the whole structure. Walk the breakdown and spot where your number diverged.',
  };
}

/** "3.4× out" / "1.1× out" — the ratio in the form students actually read. */
export function formatRatio(ratio: number): string {
  return `${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}× out`;
}

/**
 * Median, not mean: estimates are log-distributed and a single student typing
 * an extra three zeros would drag an average somewhere meaningless.
 */
export function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
