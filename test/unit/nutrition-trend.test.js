import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateItem, sumEntries, weeklyAverage } from '../../public/js/core/nutrition.js';
import { FOODS, getFood, searchFoods } from '../../public/js/core/foods.js';
import { movingAverage, weeklyChange, isPlateau, safetySignals, trendWeight } from '../../public/js/core/trend.js';
import { addDays } from '../../public/js/core/dates.js';

test('food table is well formed and roughly consistent (4/4/9 rule)', () => {
  const ids = new Set();
  for (const f of FOODS) {
    assert.ok(!ids.has(f.id), `duplicate ${f.id}`);
    ids.add(f.id);
    assert.ok(f.zh && f.en && f.g > 0 && f.u.length === 2, f.id);
    const atwater = f.p * 4 + f.c * 4 + f.f * 9;
    // alcohol (beer, wine) and fibre (very low-calorie vegetables) make some foods drift;
    // everything else should agree within 25%
    if (!['beer', 'wine'].includes(f.id) && f.k > 40) {
      assert.ok(Math.abs(atwater - f.k) / f.k < 0.25, `${f.id}: ${f.k} kcal vs macros ${atwater.toFixed(0)}`);
    }
  }
});

test('search finds foods by Chinese, English and alias', () => {
  assert.equal(searchFoods('米饭')[0].id, 'rice');
  assert.equal(searchFoods('salmon')[0].id, 'salmon');
  assert.equal(searchFoods('西红柿')[0].id, 'tomato');
  assert.ok(searchFoods('奶茶').some((f) => f.id === 'bubble_tea'));
  assert.deepEqual(searchFoods(''), []);
});

test('rice: plain portion, no range when weighed', () => {
  const e = estimateItem({ foodId: 'rice', grams: 150, source: 'db' });
  assert.equal(e.kcal, 195);
  assert.equal(e.low, 195);
  assert.equal(e.high, 195);
  assert.equal(e.protein, 4.1);
});

test('stir-fried chicken from a photo adds oil and a range', () => {
  const e = estimateItem({ foodId: 'chicken_breast', grams: 120, cooking: 'stirfried', source: 'photo' });
  // 198 kcal meat + 0.05*120 g oil * 8.84 = 53 -> 251
  assert.equal(e.kcal, 251);
  assert.equal(e.low, Math.round(198 * 0.75 + 0.03 * 120 * 8.84));
  assert.equal(e.high, Math.round(198 * 1.25 + 0.09 * 120 * 8.84));
  assert.ok(e.low < e.kcal && e.kcal < e.high);
});

test('dishes ignore the cooking selector (oil already included)', () => {
  const a = estimateItem({ foodId: 'kungpao', grams: 250, cooking: 'deepfried', source: 'db' });
  assert.equal(a.kcal, 475);
});

test('custom items use their own per-100 g values', () => {
  const e = estimateItem({ per100: { k: 200, p: 10, c: 20, f: 8 }, grams: 50, source: 'custom' });
  assert.equal(e.kcal, 100);
  assert.equal(e.protein, 5);
});

test('day sums and weekly average skip empty days', () => {
  const t = sumEntries([{ kcal: 500, kcal_low: 400, kcal_high: 650, protein: 30 }, { kcal: 300, protein: 12.25 }]);
  assert.equal(t.kcal, 800);
  assert.equal(t.low, 700);
  assert.equal(t.high, 950);
  assert.equal(t.protein, 42.3);
  const avg = weeklyAverage([{ kcal: 1500, protein: 80, count: 3 }, { kcal: 0, protein: 0, count: 0 }, { kcal: 1700, protein: 90, count: 4 }]);
  assert.deepEqual(avg, { kcal: 1600, protein: 85, days: 2 });
  assert.equal(weeklyAverage([]), null);
});

const series = (start, days, kg0, perWeek, noise = () => 0) =>
  Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), kg: kg0 + (perWeek / 7) * i + noise(i) }));

test('7-day moving average smooths daily swings', () => {
  const zig = series('2026-09-01', 14, 70, 0, (i) => (i % 2 ? 0.8 : -0.8));
  const ma = movingAverage(zig);
  const last = ma[ma.length - 1];
  assert.ok(Math.abs(last.avg - 70) < 0.2, `avg ${last.avg}`);
  assert.equal(movingAverage([]).length, 0);
  assert.equal(trendWeight([]), null);
});

test('weekly change recovers a steady trend', () => {
  const s = series('2026-09-01', 28, 72, -0.5);
  assert.ok(Math.abs(weeklyChange(s, 14) + 0.5) < 0.02);
  assert.equal(weeklyChange(s.slice(0, 5), 14), null);
});

test('plateau needs 3 weeks of data and a flat 2-week trend', () => {
  assert.equal(isPlateau(series('2026-09-01', 28, 70, 0)), true);
  assert.equal(isPlateau(series('2026-09-01', 28, 72, -0.5)), false);
  assert.equal(isPlateau(series('2026-09-01', 14, 70, 0)), false);
});

test('safety: three low-intake days in a row', () => {
  const today = '2026-10-18';
  const day = (i, kcal, count = 3) => ({ date: addDays(today, -i), kcal, count });
  const low = safetySignals({ today, floor: 1300, dayTotals: [day(1, 800), day(2, 900), day(3, 700)], weights: [], planStart: null });
  assert.deepEqual(low, ['lowIntake']);
  // one item logged = probably forgot to log, not a signal
  const sparse = safetySignals({ today, floor: 1300, dayTotals: [day(1, 800), day(2, 300, 1), day(3, 700)], weights: [], planStart: null });
  assert.deepEqual(sparse, []);
});

test('safety: rapid loss only after 3 weeks', () => {
  const today = '2026-10-18';
  const fast = series(addDays(today, -27), 28, 80, -1.6);
  assert.deepEqual(safetySignals({ today, floor: 1300, dayTotals: [], weights: fast, planStart: addDays(today, -27) }), ['rapidLoss']);
  assert.deepEqual(safetySignals({ today, floor: 1300, dayTotals: [], weights: fast, planStart: addDays(today, -10) }), []);
  const ok = series(addDays(today, -27), 28, 80, -0.6);
  assert.deepEqual(safetySignals({ today, floor: 1300, dayTotals: [], weights: ok, planStart: addDays(today, -27) }), []);
});

test('getFood returns null for unknown ids', () => {
  assert.equal(getFood('nope'), null);
});
