// Data access shared by the API routes and the demo-account seeder.

import { estimateItem, COOKING, MEALS, sumEntries } from '../public/js/core/nutrition.js';
import { getFood } from '../public/js/core/foods.js';
import { buildTargets, evaluateGoal, screen } from '../public/js/core/plan.js';
import { buildTrainingPlan, resolveDay, progress } from '../public/js/core/training.js';
import { addDays, weekday } from '../public/js/core/dates.js';
import { TRACKING_ITEMS, SLEEP_QUALITY, MAX_WATER_ML } from '../public/js/core/body.js';
import { CYCLE_KINDS, checkPeriod } from '../public/js/core/cycle.js';

const json = (s) => (s ? JSON.parse(s) : null);
const now = () => Date.now();

export class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// ------------------------------------------------------------- profile/plan

export function getProfile(db, uid) {
  return json(db.prepare('SELECT data FROM profiles WHERE user_id = ?').get(uid)?.data);
}

export function saveProfile(db, uid, profile) {
  db.prepare(`INSERT INTO profiles (user_id, data, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(uid, JSON.stringify(profile), now());
}

export function getPlan(db, uid) {
  return json(db.prepare('SELECT data FROM plans WHERE user_id = ?').get(uid)?.data);
}

export function savePlan(db, uid, plan) {
  db.prepare(`INSERT INTO plans (user_id, data, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(uid, JSON.stringify(plan), now());
}

/** Re-checks the goal on the server and builds the full plan for one option. */
export function createPlan(db, uid, profile, optionId, today, { ack = false } = {}) {
  const s = screen(profile);
  if (s.status === 'blocked') throw new HttpError(403, 'blocked', { blocked: s.blocked });
  if (s.status === 'caution' && !ack) throw new HttpError(400, 'needs_ack', { caution: s.caution });
  const ev = evaluateGoal(profile, today);
  if (ev.mode !== 'loss') throw new HttpError(400, 'not_loss');
  const option = ev.options.find((o) => o.id === optionId);
  if (!option) throw new HttpError(400, 'bad_option');
  const plan = {
    version: 1,
    createdAt: today,
    updatedAt: today,
    startKg: profile.weightKg,
    option,
    targets: buildTargets(profile, option),
    training: buildTrainingPlan(profile),
    phase: 'loss',
    maintainSince: null,
    acknowledged: s.caution,
  };
  const tx = db.transaction(() => {
    savePlan(db, uid, plan);
    db.prepare('DELETE FROM exercise_state WHERE user_id = ?').run(uid);
    db.prepare('INSERT OR IGNORE INTO weights (user_id, date, kg) VALUES (?, ?, ?)').run(uid, today, profile.weightKg);
  });
  tx();
  return plan;
}

// -------------------------------------------------------------------- food

const SOURCES = ['photo', 'db', 'custom', 'recent', 'copy', 'text'];

function foodRow(r) {
  return {
    id: r.id, date: r.date, meal: r.meal, name: r.name, foodId: r.food_id, grams: r.grams, cooking: r.cooking,
    plain: !!r.plain, source: r.source, kcal: r.kcal, kcal_low: r.kcal_low, kcal_high: r.kcal_high, protein: r.protein,
    per100: json(r.per100),
  };
}

const num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

/** Validates one food item from a client and fills in the estimate. */
export function normalizeItem(item) {
  if (!item || typeof item !== 'object') throw new HttpError(400, 'bad_item');
  const food = item.foodId ? getFood(item.foodId) : null;
  if (item.foodId && !food) throw new HttpError(400, 'unknown_food');
  const grams = Number(item.grams);
  if (!num(grams, 1, 3000)) throw new HttpError(400, 'bad_grams');
  const cooking = item.cooking in COOKING ? item.cooking : 'plain';
  const source = SOURCES.includes(item.source) ? item.source : 'custom';
  let per100 = null;
  if (!food) {
    const p = item.per100 || {};
    per100 = { k: Number(p.k), p: Number(p.p) || 0, c: Number(p.c) || 0, f: Number(p.f) || 0 };
    if (!num(per100.k, 0, 900) || !num(per100.p, 0, 100) || !num(per100.c, 0, 100) || !num(per100.f, 0, 100)) {
      throw new HttpError(400, 'bad_nutrition');
    }
  }
  const name = String(item.name || (food ? food.zh : '')).trim().slice(0, 60);
  if (!name) throw new HttpError(400, 'bad_name');
  const plain = food ? !!food.plain : !!item.plain;
  const est = estimateItem({ foodId: food?.id, per100, grams, cooking, plain, source });
  return { name, foodId: food?.id ?? null, grams, cooking, per100, plain, source, est };
}

export function addFood(db, uid, date, meal, item) {
  if (!MEALS.includes(meal)) throw new HttpError(400, 'bad_meal');
  const n = normalizeItem(item);
  const info = db.prepare(`INSERT INTO food_entries
      (user_id, date, meal, name, food_id, grams, cooking, per100, plain, source, kcal, kcal_low, kcal_high, protein, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uid, date, meal, n.name, n.foodId, n.grams, n.cooking, n.per100 ? JSON.stringify(n.per100) : null, n.plain ? 1 : 0,
      n.source, n.est.kcal, n.est.low, n.est.high, n.est.protein, now());
  return foodRow(db.prepare('SELECT * FROM food_entries WHERE id = ?').get(info.lastInsertRowid));
}

export function updateFood(db, uid, id, changes) {
  const r = db.prepare('SELECT * FROM food_entries WHERE id = ? AND user_id = ?').get(id, uid);
  if (!r) throw new HttpError(404, 'not_found');
  const meal = changes.meal ?? r.meal;
  if (!MEALS.includes(meal)) throw new HttpError(400, 'bad_meal');
  const n = normalizeItem({
    name: r.name, foodId: r.food_id, per100: json(r.per100), plain: !!r.plain, source: r.source,
    grams: changes.grams ?? r.grams, cooking: changes.cooking ?? r.cooking,
  });
  db.prepare(`UPDATE food_entries SET meal = ?, grams = ?, cooking = ?, kcal = ?, kcal_low = ?, kcal_high = ?, protein = ?
              WHERE id = ?`).run(meal, n.grams, n.cooking, n.est.kcal, n.est.low, n.est.high, n.est.protein, id);
  return foodRow(db.prepare('SELECT * FROM food_entries WHERE id = ?').get(id));
}

export function deleteFood(db, uid, id) {
  const info = db.prepare('DELETE FROM food_entries WHERE id = ? AND user_id = ?').run(id, uid);
  if (!info.changes) throw new HttpError(404, 'not_found');
}

export function foodForDate(db, uid, date) {
  return db.prepare('SELECT * FROM food_entries WHERE user_id = ? AND date = ? ORDER BY id').all(uid, date).map(foodRow);
}

/** One row per day from `from` to `to` inclusive, empty days included. */
export function dayTotals(db, uid, from, to) {
  const rows = db.prepare(`SELECT date, kcal, kcal_low, kcal_high, protein FROM food_entries
                           WHERE user_id = ? AND date BETWEEN ? AND ?`).all(uid, from, to);
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.date)) by.set(r.date, []);
    by.get(r.date).push(r);
  }
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, ...sumEntries(by.get(d) || []) });
  return out;
}

/** Distinct recently eaten items (by name + grams), most frequent first. */
export function recentFoods(db, uid, today, limit = 12) {
  const rows = db.prepare(`SELECT name, food_id, grams, cooking, per100, plain, kcal, protein, COUNT(*) AS n, MAX(id) AS last
                           FROM food_entries WHERE user_id = ? AND date >= ?
                           GROUP BY name, grams ORDER BY n DESC, last DESC LIMIT ?`).all(uid, addDays(today, -30), limit);
  return rows.map((r) => ({ name: r.name, foodId: r.food_id, grams: r.grams, cooking: r.cooking, per100: json(r.per100),
    plain: !!r.plain, kcal: r.kcal, protein: r.protein, times: r.n }));
}

export function copyMeal(db, uid, from, to, meal) {
  const src = db.prepare('SELECT * FROM food_entries WHERE user_id = ? AND date = ? AND meal = ?').all(uid, from, meal);
  const tx = db.transaction(() => src.map((r) => addFood(db, uid, to, meal, {
    name: r.name, foodId: r.food_id, grams: r.grams, cooking: r.cooking, per100: json(r.per100), plain: !!r.plain, source: 'copy',
  })));
  return tx();
}

// ------------------------------------------------------------------ weights

export function getWeights(db, uid) {
  return db.prepare('SELECT date, kg FROM weights WHERE user_id = ? ORDER BY date').all(uid);
}

export function setWeight(db, uid, date, kg) {
  if (!num(kg, 30, 300)) throw new HttpError(400, 'bad_weight');
  db.prepare(`INSERT INTO weights (user_id, date, kg) VALUES (?, ?, ?)
              ON CONFLICT(user_id, date) DO UPDATE SET kg = excluded.kg`)
    .run(uid, date, Math.round(kg * 100) / 100);
}

export function deleteWeight(db, uid, date) {
  db.prepare('DELETE FROM weights WHERE user_id = ? AND date = ?').run(uid, date);
}

// --------------------------------------------------------- optional tracking

export const TRACKING_DEFAULT = { waist: false, cycle: false, sleepQuality: false, water: false, cycleKind: 'natural', introDismissed: false };

export function getTracking(user) {
  let saved = {};
  try { saved = JSON.parse(user?.tracking || '{}') || {}; } catch { /* keep defaults */ }
  const out = { ...TRACKING_DEFAULT };
  for (const k of Object.keys(TRACKING_DEFAULT)) if (k in saved) out[k] = saved[k];
  return out;
}

/** Applies a partial change; unknown keys are ignored and values are checked. */
export function setTracking(db, user, patch) {
  const next = getTracking(user);
  for (const k of [...TRACKING_ITEMS, 'introDismissed']) {
    if (patch[k] === undefined) continue;
    if (typeof patch[k] !== 'boolean') throw new HttpError(400, 'bad_tracking');
    next[k] = patch[k];
  }
  if (patch.cycleKind !== undefined) {
    if (!CYCLE_KINDS.includes(patch.cycleKind)) throw new HttpError(400, 'bad_tracking');
    next.cycleKind = patch.cycleKind;
  }
  const text = JSON.stringify(next);
  db.prepare('UPDATE users SET tracking = ? WHERE id = ?').run(text, user.id);
  return { ...user, tracking: text };
}

export function getWaists(db, uid) {
  return db.prepare('SELECT date, cm FROM waists WHERE user_id = ? ORDER BY date').all(uid);
}

export function setWaist(db, uid, date, cm) {
  if (!num(cm, 40, 250)) throw new HttpError(400, 'bad_waist');
  db.prepare(`INSERT INTO waists (user_id, date, cm) VALUES (?, ?, ?)
              ON CONFLICT(user_id, date) DO UPDATE SET cm = excluded.cm`).run(uid, date, Math.round(cm * 10) / 10);
}

export function deleteWaist(db, uid, date) {
  db.prepare('DELETE FROM waists WHERE user_id = ? AND date = ?').run(uid, date);
}

export function getPeriods(db, uid) {
  return db.prepare('SELECT start_date AS start, end_date AS end FROM periods WHERE user_id = ? ORDER BY start_date').all(uid);
}

/** Adds a period, or sets/changes the end date of the one starting on `start`. */
export function savePeriod(db, uid, { start, end = null }, today) {
  const others = getPeriods(db, uid).filter((p) => p.start !== start);
  const bad = checkPeriod({ start, end }, others, today);
  if (bad) throw new HttpError(400, bad);
  db.prepare(`INSERT INTO periods (user_id, start_date, end_date) VALUES (?, ?, ?)
              ON CONFLICT(user_id, start_date) DO UPDATE SET end_date = excluded.end_date`).run(uid, start, end);
  return getPeriods(db, uid);
}

export function deletePeriod(db, uid, start) {
  db.prepare('DELETE FROM periods WHERE user_id = ? AND start_date = ?').run(uid, start);
}

export function clearPeriods(db, uid) {
  db.prepare('DELETE FROM periods WHERE user_id = ?').run(uid);
}

// -------------------------------------------------------------- daily logs

const DAILY_FIELDS = 'steps, sleep_hours AS sleepHours, sleep_quality AS sleepQuality, water_ml AS waterMl';
const DAILY_COLS = `date, ${DAILY_FIELDS}`;

export function getDaily(db, uid, date) {
  const r = db.prepare(`SELECT ${DAILY_FIELDS} FROM daily_logs WHERE user_id = ? AND date = ?`).get(uid, date);
  return r ? { ...r } : { steps: null, sleepHours: null, sleepQuality: null, waterMl: null };
}

/** Fields left undefined or null keep what was saved before. */
export function setDaily(db, uid, date, { steps, sleepHours, sleepQuality, waterMl }) {
  if (steps != null && !(Number.isInteger(steps) && steps >= 0 && steps <= 100000)) throw new HttpError(400, 'bad_steps');
  if (sleepHours != null && !num(sleepHours, 0, 24)) throw new HttpError(400, 'bad_sleep');
  if (sleepQuality != null && !SLEEP_QUALITY.includes(sleepQuality)) throw new HttpError(400, 'bad_sleep_quality');
  if (waterMl != null && !(Number.isInteger(waterMl) && waterMl >= 0 && waterMl <= MAX_WATER_ML)) throw new HttpError(400, 'bad_water');
  db.prepare(`INSERT INTO daily_logs (user_id, date, steps, sleep_hours, sleep_quality, water_ml) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, date) DO UPDATE SET
                steps = COALESCE(excluded.steps, daily_logs.steps),
                sleep_hours = COALESCE(excluded.sleep_hours, daily_logs.sleep_hours),
                sleep_quality = COALESCE(excluded.sleep_quality, daily_logs.sleep_quality),
                water_ml = COALESCE(excluded.water_ml, daily_logs.water_ml)`)
    .run(uid, date, steps ?? null, sleepHours ?? null, sleepQuality ?? null, waterMl ?? null);
  return getDaily(db, uid, date);
}

export function dailyRange(db, uid, from, to) {
  return db.prepare(`SELECT ${DAILY_COLS} FROM daily_logs WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date`).all(uid, from, to);
}

// ----------------------------------------------------------------- training

export function getState(db, uid) {
  const out = {};
  for (const r of db.prepare('SELECT slot, data FROM exercise_state WHERE user_id = ?').all(uid)) out[r.slot] = JSON.parse(r.data);
  return out;
}

function workoutRow(r) {
  return { id: r.id, date: r.date, key: r.day_key, sets: json(r.sets), changes: json(r.changes) };
}

export function getWorkout(db, uid, date) {
  const r = db.prepare('SELECT * FROM workouts WHERE user_id = ? AND date = ?').get(uid, date);
  return r ? workoutRow(r) : null;
}

export function workoutHistory(db, uid, limit = 30) {
  return db.prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY date DESC LIMIT ?').all(uid, limit).map(workoutRow);
}

export function workoutsBetween(db, uid, from, to) {
  return db.prepare('SELECT date, day_key AS key FROM workouts WHERE user_id = ? AND date BETWEEN ? AND ?').all(uid, from, to);
}

/**
 * Saves a finished workout and moves each slot forward with the progression rules.
 * `asWeekday` lets someone do a planned session on a different day.
 */
export function logWorkout(db, uid, date, sets, asWeekday = null) {
  const plan = getPlan(db, uid);
  const profile = getProfile(db, uid);
  if (!plan || !profile) throw new HttpError(400, 'no_plan');
  if (getWorkout(db, uid, date)) throw new HttpError(409, 'already_logged');
  const wd = Number.isInteger(asWeekday) ? asWeekday : weekday(date);
  const state = getState(db, uid);
  const day = resolveDay(plan.training, wd, state);
  if (!day) throw new HttpError(400, 'rest_day');
  if (!Array.isArray(sets) || sets.length === 0 || sets.length > 80) throw new HttpError(400, 'bad_sets');

  const bySlot = new Map(day.slots.map((s) => [s.slot, []]));
  for (const s of sets) {
    if (!s || !bySlot.has(s.slot)) throw new HttpError(400, 'bad_slot');
    const clean = {};
    if (s.reps != null) { if (!(Number.isInteger(s.reps) && s.reps >= 0 && s.reps <= 200)) throw new HttpError(400, 'bad_reps'); clean.reps = s.reps; }
    if (s.secs != null) { if (!num(s.secs, 0, 3600)) throw new HttpError(400, 'bad_secs'); clean.secs = Math.round(s.secs); }
    if (s.minutes != null) { if (!num(s.minutes, 0, 300)) throw new HttpError(400, 'bad_minutes'); clean.minutes = Math.round(s.minutes); }
    if (s.weight != null) { if (!num(s.weight, 0, 500)) throw new HttpError(400, 'bad_weight'); clean.weight = s.weight; }
    bySlot.get(s.slot).push(clean);
  }

  const changes = [];
  const before = {};
  const logged = [];
  const tx = db.transaction(() => {
    for (const target of day.slots) {
      const done = bySlot.get(target.slot);
      if (!done.length) continue;
      logged.push({ slot: target.slot, exerciseId: target.exerciseId, target: { reps: target.reps, secs: target.secs, minutes: target.minutes, weight: target.weight ?? null, sets: target.sets }, done });
      const next = progress(target, done, profile);
      before[target.slot] = state[target.slot] ?? null;
      const { change, ...data } = next;
      db.prepare(`INSERT INTO exercise_state (user_id, slot, data) VALUES (?, ?, ?)
                  ON CONFLICT(user_id, slot) DO UPDATE SET data = excluded.data`).run(uid, target.slot, JSON.stringify(data));
      changes.push({ slot: target.slot, from: target.exerciseId, to: next.exerciseId, change, next: data });
    }
    db.prepare(`INSERT INTO workouts (user_id, date, day_key, sets, changes, state_before, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(uid, date, day.key, JSON.stringify(logged), JSON.stringify(changes), JSON.stringify(before), now());
  });
  tx();
  return getWorkout(db, uid, date);
}

/** Undo the most recent workout and put progress back where it was. */
export function undoWorkout(db, uid, date) {
  const r = db.prepare('SELECT * FROM workouts WHERE user_id = ? AND date = ?').get(uid, date);
  if (!r) throw new HttpError(404, 'not_found');
  const latest = db.prepare('SELECT date FROM workouts WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 1').get(uid);
  if (latest.date !== date) throw new HttpError(409, 'not_latest');
  const tx = db.transaction(() => {
    for (const [slot, data] of Object.entries(json(r.state_before))) {
      if (data === null) db.prepare('DELETE FROM exercise_state WHERE user_id = ? AND slot = ?').run(uid, slot);
      else db.prepare('UPDATE exercise_state SET data = ? WHERE user_id = ? AND slot = ?').run(JSON.stringify(data), uid, slot);
    }
    db.prepare('DELETE FROM workouts WHERE id = ?').run(r.id);
  });
  tx();
}

/** Planned vs done sessions for the Monday-to-Sunday week containing `today`. */
export function weekTraining(db, uid, plan, today) {
  const monday = addDays(today, -weekday(today));
  const sunday = addDays(monday, 6);
  const planned = Object.keys(plan?.training?.week || {}).length;
  const done = workoutsBetween(db, uid, monday, sunday).length;
  return { planned, done, monday };
}

// ------------------------------------------------------------- account data

export function exportAll(db, user) {
  const uid = user.id;
  return {
    exportedAt: new Date().toISOString(),
    account: { email: user.email, createdAt: new Date(user.created_at).toISOString(), lang: user.lang, units: user.units, tracking: getTracking(user) },
    profile: getProfile(db, uid),
    plan: getPlan(db, uid),
    food: db.prepare('SELECT * FROM food_entries WHERE user_id = ? ORDER BY date, id').all(uid).map(foodRow),
    weights: getWeights(db, uid),
    waists: getWaists(db, uid),
    periods: getPeriods(db, uid),
    daily: db.prepare(`SELECT ${DAILY_COLS} FROM daily_logs WHERE user_id = ? ORDER BY date`).all(uid),
    workouts: db.prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY date').all(uid).map(workoutRow),
  };
}

export function deleteUser(db, uid) {
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
}
