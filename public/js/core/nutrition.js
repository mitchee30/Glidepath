// Nutrition estimates for one logged item and for a day.

import { getFood } from './foods.js';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

// Oil absorbed while cooking, as a fraction of the food's weight: [low, mid, high].
// Rough kitchen averages; real values swing a lot, which is why we show a range.
export const COOKING = {
  plain: [0, 0, 0],        // raw / boiled / steamed
  grilled: [0.01, 0.02, 0.04],
  panfried: [0.02, 0.04, 0.07],
  stirfried: [0.03, 0.05, 0.09],
  deepfried: [0.06, 0.1, 0.15],
};

export const OIL_KCAL_PER_G = 8.84;

// How unsure we are about the portion size, by how the item was logged.
export const PORTION_UNCERTAINTY = { photo: 0.25, text: 0.2, db: 0, custom: 0, copy: 0, recent: 0 };

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * item: { grams, cooking?, source, per100: {k,p,c,f} } or { foodId } (per100 taken from the table)
 * returns { kcal, low, high, protein, carbs, fat }
 */
export function estimateItem(item) {
  const food = item.foodId ? getFood(item.foodId) : null;
  const per100 = food ? { k: food.k, p: food.p, c: food.c, f: food.f } : item.per100;
  if (!per100) throw new Error('no nutrition data');
  const grams = Math.max(0, Number(item.grams) || 0);
  const plain = food ? !!food.plain : !!item.plain;
  const cook = plain ? COOKING[item.cooking] || COOKING.plain : COOKING.plain;
  const u = PORTION_UNCERTAINTY[item.source] ?? 0;

  const base = (per100.k * grams) / 100;
  const oil = cook.map((frac) => frac * grams * OIL_KCAL_PER_G);
  return {
    kcal: Math.round(base + oil[1]),
    low: Math.round(base * (1 - u) + oil[0]),
    high: Math.round(base * (1 + u) + oil[2]),
    protein: r1((per100.p * grams) / 100),
    carbs: r1((per100.c * grams) / 100),
    fat: r1((per100.f * grams) / 100 + (oil[1] / OIL_KCAL_PER_G)),
  };
}

export function sumEntries(entries) {
  const t = { kcal: 0, low: 0, high: 0, protein: 0, count: entries.length };
  for (const e of entries) {
    t.kcal += e.kcal;
    t.low += e.kcal_low ?? e.kcal;
    t.high += e.kcal_high ?? e.kcal;
    t.protein += e.protein || 0;
  }
  t.protein = r1(t.protein);
  return t;
}

/** Average over the logged days only (days with no entries are skipped). */
export function weeklyAverage(dayTotals) {
  const logged = dayTotals.filter((d) => d.count > 0);
  if (!logged.length) return null;
  const kcal = logged.reduce((s, d) => s + d.kcal, 0) / logged.length;
  const protein = logged.reduce((s, d) => s + d.protein, 0) / logged.length;
  return { kcal: Math.round(kcal), protein: r1(protein), days: logged.length };
}
