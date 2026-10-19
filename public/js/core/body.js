// Optional body measures: waist, sleep quality and water. All of them are opt-in.

import { addDays, daysBetween } from './dates.js';

export const TRACKING_ITEMS = ['waist', 'cycle', 'sleepQuality', 'water'];

// ------------------------------------------------------------------ waist

/** Waist-to-height ratio bands (NICE 2022): under 0.5 is the healthy range for adults. */
export const WHTR_HEALTHY = 0.5;
export const WHTR_HIGH = 0.6;

export function whtrBand(ratio) {
  if (!Number.isFinite(ratio)) return null;
  if (ratio >= WHTR_HIGH) return 'high';
  if (ratio >= WHTR_HEALTHY) return 'raised';
  if (ratio >= 0.4) return 'healthy';
  return null;
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/**
 * entries: [{date, cm}]. Returns the latest measure, its change over about four weeks,
 * the change since the first measure, the waist-to-height ratio, and whether it's time to measure.
 */
export function waistSummary(entries, heightCm, today) {
  if (!entries.length) return { latest: null, due: true, count: 0 };
  const s = [...entries].sort(byDate);
  const latest = s[s.length - 1];
  const first = s[0];
  // the measure closest to four weeks before the latest one, between two and six weeks back
  let ref = null;
  for (const e of s) {
    const gap = daysBetween(e.date, latest.date);
    if (gap < 14 || gap > 42) continue;
    if (!ref || Math.abs(gap - 28) < Math.abs(daysBetween(ref.date, latest.date) - 28)) ref = e;
  }
  const ratio = heightCm ? Math.round((latest.cm / heightCm) * 100) / 100 : null;
  return {
    latest,
    count: s.length,
    recent: ref ? { cm: round1(latest.cm - ref.cm), weeks: Math.round(daysBetween(ref.date, latest.date) / 7) } : null,
    sinceFirst: first.date !== latest.date ? { cm: round1(latest.cm - first.cm), since: first.date } : null,
    ratio,
    band: whtrBand(ratio),
    healthyBelowCm: heightCm ? round1(heightCm * WHTR_HEALTHY) : null,
    due: daysBetween(latest.date, today) >= 7,
  };
}

/**
 * Waist clearly going down over the last four weeks (at least 1 cm across 2+ weeks).
 * Used to tell a real plateau from "the scale is stuck but fat is still coming off".
 */
export function waistDown(entries, today) {
  const recent = entries.filter((e) => e.date >= addDays(today, -28) && e.date <= today).sort(byDate);
  if (recent.length < 2) return null;
  const a = recent[0];
  const b = recent[recent.length - 1];
  const days = daysBetween(a.date, b.date);
  const change = b.cm - a.cm;
  if (days < 14 || change > -1) return null;
  return { cm: round1(-change), weeks: Math.round(days / 7) };
}

// ------------------------------------------------------------------ sleep

export const SLEEP_QUALITY = [1, 2, 3]; // 1 = slept badly, 2 = so-so, 3 = slept well
export const SHORT_SLEEP_H = 6;

/**
 * Two of the last three nights were under 6 hours or rated as bad sleep.
 * daily: rows with {date, sleepHours, sleepQuality}; the row for a date is the night before it.
 */
export function poorSleep(daily, today) {
  const by = new Map(daily.map((d) => [d.date, d]));
  let bad = 0;
  for (let i = 0; i < 3; i++) {
    const d = by.get(addDays(today, -i));
    if (!d) continue;
    if ((d.sleepHours != null && d.sleepHours < SHORT_SLEEP_H) || d.sleepQuality === 1) bad++;
  }
  return bad >= 2;
}

/** Average hours and short nights over the rows given (nights with no entry are skipped). */
export function sleepSummary(daily, targetHours) {
  const nights = daily.filter((d) => d.sleepHours != null);
  if (!nights.length) return null;
  const avg = nights.reduce((s, d) => s + d.sleepHours, 0) / nights.length;
  return { nights: nights.length, avg: round1(avg), short: nights.filter((d) => d.sleepHours < targetHours - 0.25).length };
}

// ------------------------------------------------------------------ water

export const CUP_ML = 250;
export const MAX_WATER_ML = 8000;

/**
 * A reference, not a rule. EFSA's adequate total water intake is about 2.0 L a day for women
 * and 2.5 L for men, and roughly a fifth of it comes from food, so drinks of about 1.6–2.0 L.
 */
const WATER_CUPS = { female: 7, male: 8, other: 7 };

export function waterTarget(sex) {
  const cups = WATER_CUPS[sex] ?? WATER_CUPS.other;
  return { cups, ml: cups * CUP_ML };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
