import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../../public/js/core/dates.js';
import {
  cycleStats, cycleStatus, cycleLengths, periodEnd, periodBands, checkPeriod, MISSED_DAYS,
} from '../../public/js/core/cycle.js';
import { waistSummary, waistDown, whtrBand, poorSleep, sleepSummary, waterTarget } from '../../public/js/core/body.js';

const T = '2026-10-19';
const p = (startOffset, len = 5) => ({ start: addDays(T, startOffset), end: len ? addDays(T, startOffset + len - 1) : null });

// ------------------------------------------------------------------ cycle

test('cycle length is the median of recent cycles; odd gaps are ignored', () => {
  assert.deepEqual(cycleStats([]), { length: 28, known: false, irregular: false, samples: 0 });
  assert.equal(cycleStats([p(-60)]).known, false);
  const periods = [p(-120), p(-90), p(-60), p(-31)];
  assert.deepEqual(cycleLengths(periods), [30, 30, 29]);
  assert.equal(cycleStats(periods).length, 30);
  // a 75-day gap is a missed log, not a cycle
  assert.deepEqual(cycleLengths([p(-150), p(-75), p(-46)]), [29]);
  // 24 vs 36 days: irregular
  assert.equal(cycleStats([p(-120), p(-96), p(-60), p(-30)]).irregular, true);
  assert.equal(cycleStats(periods).irregular, false);
});

test('cycle status: period days, phases and the next expected start', () => {
  const periods = [p(-58), p(-29)]; // 29-day cycle
  const during = cycleStatus([...periods, p(-1, 0)], T);
  assert.equal(during.phase, 'period');
  assert.equal(during.day, 2);
  assert.equal(during.open, true);
  assert.equal(during.retention, true);

  const follicular = cycleStatus(periods, addDays(T, -29 + 8));
  assert.equal(follicular.phase, 'follicular');
  assert.equal(follicular.retention, false);

  const due = cycleStatus(periods, T); // day 30 of a 29-day cycle: expected today
  assert.equal(due.phase, 'luteal');
  assert.equal(due.daysToNext, 0);
  const late = cycleStatus(periods, addDays(T, 2));
  assert.equal(late.phase, 'late');
  assert.equal(late.lateBy, 2);
  assert.equal(late.retention, true);
  assert.equal(cycleStatus(periods, addDays(T, 9)).retention, false);

  const pre = cycleStatus(periods, addDays(T, -5)); // 5 days before the expected start
  assert.equal(pre.phase, 'luteal');
  assert.equal(pre.daysToNext, 5);
  assert.equal(pre.nextStart, T);
  assert.equal(pre.retention, true);

  const midLuteal = cycleStatus(periods, addDays(T, -10));
  assert.equal(midLuteal.phase, 'luteal');
  assert.equal(midLuteal.retention, false);
});

test('cycle status: open periods, hormonal contraception and a missed period', () => {
  // never marked as ended: still "now" on day 7, assumed 5 days once it's old
  const open = { start: addDays(T, -6), end: null };
  assert.equal(cycleStatus([open], T).inPeriod, true);
  assert.equal(periodEnd({ start: addDays(T, -40), end: null }, T), addDays(T, -36));

  const hormonal = cycleStatus([p(-20)], T, 'hormonal');
  assert.equal(hormonal.predicted, false);
  assert.equal(hormonal.phase, null);
  assert.equal(hormonal.retention, false);
  assert.equal(hormonal.missed, false);

  assert.equal(cycleStatus([p(-MISSED_DAYS)], T).missed, true);
  assert.equal(cycleStatus([p(-MISSED_DAYS + 1)], T).missed, false);
  assert.equal(cycleStatus([p(-MISSED_DAYS)], T, 'hormonal').missed, false);
  assert.equal(cycleStatus([], T).hasData, false);
});

test('period bands are clipped to today; saving checks overlaps and dates', () => {
  assert.deepEqual(periodBands([{ start: addDays(T, -1), end: null }], T), [{ from: addDays(T, -1), to: T }]);
  const others = [p(-30)];
  assert.equal(checkPeriod({ start: addDays(T, -28), end: null }, others, T), 'period_overlap');
  assert.equal(checkPeriod({ start: addDays(T, -33), end: addDays(T, -30) }, others, T), 'period_overlap');
  assert.equal(checkPeriod({ start: T, end: null }, others, T), null);
  assert.equal(checkPeriod({ start: addDays(T, 1), end: null }, others, T), 'period_future');
  assert.equal(checkPeriod({ start: addDays(T, -3), end: addDays(T, -5) }, others, T), 'period_end');
  assert.equal(checkPeriod({ start: addDays(T, -20), end: addDays(T, -5) }, others, T), 'period_end');
  // changing the end of the same period is not an overlap with itself
  assert.equal(checkPeriod({ start: others[0].start, end: addDays(T, -24) }, others, T), null);
});

// ------------------------------------------------------------------ waist

test('waist summary: four-week change, ratio to height and when to measure', () => {
  assert.deepEqual(waistSummary([], 165, T), { latest: null, due: true, count: 0 });
  const w = [
    { date: addDays(T, -35), cm: 90 }, { date: addDays(T, -28), cm: 89.5 },
    { date: addDays(T, -14), cm: 88.5 }, { date: addDays(T, -3), cm: 87.6 },
  ];
  const s = waistSummary(w, 165, T);
  assert.equal(s.latest.cm, 87.6);
  assert.deepEqual(s.recent, { cm: -1.9, weeks: 4 }); // vs -28: 25 days back is closest to 28
  assert.deepEqual(s.sinceFirst, { cm: -2.4, since: addDays(T, -35) });
  assert.equal(s.ratio, 0.53);
  assert.equal(s.band, 'raised');
  assert.equal(s.healthyBelowCm, 82.5);
  assert.equal(s.due, false);
  assert.equal(waistSummary(w, 165, addDays(T, 4)).due, true);
  assert.equal(whtrBand(0.45), 'healthy');
  assert.equal(whtrBand(0.61), 'high');
  assert.equal(whtrBand(0.38), null);
});

test('waist going down: at least 1 cm over two or more weeks', () => {
  assert.deepEqual(waistDown([{ date: addDays(T, -21), cm: 88 }, { date: T, cm: 86.8 }], T), { cm: 1.2, weeks: 3 });
  assert.equal(waistDown([{ date: addDays(T, -21), cm: 88 }, { date: T, cm: 87.5 }], T), null);
  assert.equal(waistDown([{ date: addDays(T, -7), cm: 88 }, { date: T, cm: 86 }], T), null);
  assert.equal(waistDown([{ date: addDays(T, -40), cm: 92 }, { date: T, cm: 86 }], T), null);
});

// ------------------------------------------------------------ sleep, water

test('poor sleep: two of the last three nights short or rated badly', () => {
  const row = (i, sleepHours, sleepQuality = null) => ({ date: addDays(T, -i), sleepHours, sleepQuality });
  assert.equal(poorSleep([row(0, 5.5), row(1, 5)], T), true);
  assert.equal(poorSleep([row(0, 7.5, 1), row(2, 8, 1)], T), true);
  assert.equal(poorSleep([row(0, 5.5), row(1, 7.5), row(2, 7)], T), false);
  assert.equal(poorSleep([row(3, 4), row(4, 4)], T), false);
  assert.deepEqual(sleepSummary([row(0, 6), row(1, 8), row(2, null)], 7.5), { nights: 2, avg: 7, short: 1 });
  assert.equal(sleepSummary([], 8), null);
});

test('water reference by sex', () => {
  assert.deepEqual(waterTarget('female'), { cups: 7, ml: 1750 });
  assert.deepEqual(waterTarget('male'), { cups: 8, ml: 2000 });
  assert.deepEqual(waterTarget('other'), { cups: 7, ml: 1750 });
});
