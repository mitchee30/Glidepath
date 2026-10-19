// Weight trend, plateau detection and safety signals.

import { addDays, daysBetween } from './dates.js';

/**
 * Trailing 7-day moving average. entries: [{date, kg}] in any order.
 * Each point averages every weigh-in from (date - 6) to date.
 */
export function movingAverage(entries, windowDays = 7) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted.map((e, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0; j--) {
      if (daysBetween(sorted[j].date, e.date) >= windowDays) break;
      sum += sorted[j].kg;
      n++;
    }
    return { date: e.date, kg: e.kg, avg: Math.round((sum / n) * 100) / 100 };
  });
}

export function trendWeight(entries) {
  const ma = movingAverage(entries);
  return ma.length ? ma[ma.length - 1].avg : null;
}

/** Trend value on or before a date (null if none). */
function avgOnOrBefore(ma, date) {
  let v = null;
  for (const p of ma) {
    if (p.date <= date) v = p;
    else break;
  }
  return v;
}

/**
 * Average change per week over the last `spanDays`, from the moving average.
 * Negative = losing. Needs data at both ends of the span.
 */
export function weeklyChange(entries, spanDays = 14) {
  const ma = movingAverage(entries);
  if (ma.length < 2) return null;
  const last = ma[ma.length - 1];
  const start = avgOnOrBefore(ma, addDays(last.date, -spanDays));
  if (!start) return null;
  const days = daysBetween(start.date, last.date);
  if (days < 7) return null;
  return ((last.avg - start.avg) / days) * 7;
}

/**
 * Plateau: in a loss phase, at least 3 weeks of data and the trend moved less
 * than 0.2 kg over the last 2 weeks.
 */
export function isPlateau(entries) {
  if (entries.length < 8) return false;
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (daysBetween(sorted[0].date, sorted[sorted.length - 1].date) < 21) return false;
  const change = weeklyChange(entries, 14);
  return change !== null && Math.abs(change * 2) < 0.2;
}

/**
 * Safety signals. These switch the app into a gentler mode and show help resources.
 *  lowIntake  – the last 3 completed days each had 2+ logged items and stayed under
 *               80% of the intake floor
 *  rapidLoss  – after the first 3 weeks, the trend is falling faster than 1.5% of
 *               body weight per week (the plan never asks for more than 1%)
 */
export function safetySignals({ today, dayTotals, floor, weights, planStart }) {
  const signals = [];
  const byDate = new Map(dayTotals.map((d) => [d.date, d]));
  let lowDays = 0;
  for (let i = 1; i <= 3; i++) {
    const d = byDate.get(addDays(today, -i));
    if (d && d.count >= 2 && d.kcal < floor * 0.8) lowDays++;
  }
  if (lowDays === 3) signals.push('lowIntake');

  if (weights.length && planStart && daysBetween(planStart, today) >= 21) {
    const change = weeklyChange(weights, 14);
    const current = trendWeight(weights);
    if (change !== null && current && -change > current * 0.015) signals.push('rapidLoss');
  }
  return signals;
}
