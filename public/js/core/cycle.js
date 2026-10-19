// Menstrual cycle helpers. Periods are [{ start, end }] with "YYYY-MM-DD" dates; end may be null.
// Everything here is an estimate from the user's own log. It is only used to read weight
// changes correctly and must never be presented as contraception or fertility advice.

import { addDays, daysBetween } from './dates.js';

export const DEFAULT_CYCLE = 28;
export const DEFAULT_PERIOD = 5;
export const MAX_PERIOD_DAYS = 14;
/** No period logged for this long (natural cycle): gently suggest a doctor. */
export const MISSED_DAYS = 90;
/** Gaps outside this range are treated as a missed log, not a real cycle. */
const MIN_CYCLE = 15;
const MAX_CYCLE = 60;
/** A period that was never marked as ended still counts as "now" for this many days. */
const OPEN_DAYS = 10;
/** Water retention commonly shows in the week before a period and its first few days. */
const PRE_DAYS = 7;
const EARLY_PERIOD_DAYS = 4;
/** Shortest-to-longest spread above this is called irregular (FIGO: 7–9 days is normal). */
const IRREGULAR_SPREAD = 9;

export const CYCLE_KINDS = ['natural', 'hormonal'];

export function sortPeriods(periods) {
  return [...periods].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** True while a period with no end date is recent enough to still be going. */
export function isOpen(p, today) {
  return !p.end && daysBetween(p.start, today) < OPEN_DAYS;
}

/** Last day of a period: its end date; while still open, today; otherwise a typical 5 days. */
export function periodEnd(p, today) {
  if (p.end) return p.end;
  const typical = addDays(p.start, DEFAULT_PERIOD - 1);
  if (today && isOpen(p, today) && today > typical) return today;
  return typical;
}

/** Days between consecutive starts that look like real cycles. */
export function cycleLengths(periods) {
  const s = sortPeriods(periods);
  const out = [];
  for (let i = 1; i < s.length; i++) {
    const d = daysBetween(s[i - 1].start, s[i].start);
    if (d >= MIN_CYCLE && d <= MAX_CYCLE) out.push(d);
  }
  return out;
}

/** Typical cycle length from the last six cycles (median), falling back to 28 days. */
export function cycleStats(periods) {
  const lengths = cycleLengths(periods).slice(-6);
  if (!lengths.length) return { length: DEFAULT_CYCLE, known: false, irregular: false, samples: 0 };
  const sorted = [...lengths].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const length = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return {
    length,
    known: true,
    irregular: sorted.length >= 2 && sorted[sorted.length - 1] - sorted[0] > IRREGULAR_SPREAD,
    samples: lengths.length,
  };
}

/**
 * Where `today` falls in the cycle.
 *   phase: period | follicular | luteal | late (natural), period | null (hormonal)
 *   retention: weight may be up from water (the week before a period and its first days)
 *   missed: natural cycle, nothing logged for 90+ days
 */
export function cycleStatus(periods, today, kind = 'natural') {
  const past = sortPeriods(periods.filter((p) => p.start <= today));
  if (!past.length) return { hasData: false, kind };
  const last = past[past.length - 1];
  const day = daysBetween(last.start, today) + 1;
  const inPeriod = today <= periodEnd(last, today);
  const base = { hasData: true, kind, lastStart: last.start, day, inPeriod, open: isOpen(last, today) };
  if (kind === 'hormonal') return { ...base, phase: inPeriod ? 'period' : null, predicted: false, retention: false, missed: false };

  const stats = cycleStats(past);
  const nextStart = addDays(last.start, stats.length);
  const daysToNext = daysBetween(today, nextStart);
  const ovulation = addDays(nextStart, -14);
  let phase;
  if (inPeriod) phase = 'period';
  else if (daysToNext < 0) phase = 'late';
  else if (today < ovulation) phase = 'follicular';
  else phase = 'luteal';
  const lateBy = phase === 'late' ? -daysToNext : 0;
  const retention = (inPeriod && day <= EARLY_PERIOD_DAYS)
    || (!inPeriod && daysToNext >= 0 && daysToNext <= PRE_DAYS)
    || (phase === 'late' && lateBy <= PRE_DAYS);
  return {
    ...base,
    phase,
    predicted: true,
    nextStart,
    daysToNext,
    lateBy,
    cycleLength: stats.length,
    known: stats.known,
    irregular: stats.irregular,
    retention,
    missed: day - 1 >= MISSED_DAYS,
  };
}

/** Date ranges to shade on a chart, clipped to today. */
export function periodBands(periods, today) {
  return sortPeriods(periods)
    .filter((p) => p.start <= today)
    .map((p) => {
      const end = periodEnd(p, today);
      return { from: p.start, to: end > today ? today : end };
    });
}

/**
 * Checks a period before saving. Returns an error code or null.
 * `others` are the user's other periods (not the one being saved).
 */
export function checkPeriod({ start, end }, others, today) {
  if (start > today) return 'period_future';
  if (end) {
    if (end < start || daysBetween(start, end) >= MAX_PERIOD_DAYS) return 'period_end';
    if (end > today) return 'period_future';
  }
  const myEnd = end || addDays(start, DEFAULT_PERIOD - 1);
  for (const q of others) {
    if (q.start === start) continue;
    if (start <= periodEnd(q, today) && q.start <= myEnd) return 'period_overlap';
  }
  return null;
}
