// Creates a throwaway demo account with four weeks of realistic data, so the
// dashboard, charts and progression can be explored without typing anything.

import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
import {
  addFood, createPlan, logWorkout, saveProfile, setDaily, setWeight, setWaist, savePeriod, getState, getPlan, dayTotals,
} from './store.js';
import { addDays, daysBetween, weekday } from '../public/js/core/dates.js';
import { resolveDay, EXERCISES } from '../public/js/core/training.js';
import { evaluateGoal } from '../public/js/core/plan.js';

export const DEMO_TTL_MS = 24 * 3600 * 1000;

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BREAKFAST = [
  [['oatmeal', 250], ['egg', 100], ['milk_skim', 250]],
  [['wholewheat_bread', 64], ['egg', 50], ['greek_yogurt', 170]],
  [['baozi', 90], ['soy_milk', 250], ['egg', 50]],
  [['congee', 300], ['egg', 50], ['cucumber', 100]],
];
const LUNCH = [
  [['rice', 150], ['kungpao', 220], ['stirfried_greens', 200]],
  [['beef_noodle_soup', 550]],
  [['rice', 150], ['tomato_egg', 220], ['chicken_breast', 100, 'stirfried']],
  [['sandwich', 200], ['apple', 180]],
  [['brown_rice', 150], ['salmon', 120, 'panfried'], ['broccoli', 150]],
];
const DINNER = [
  [['rice', 120], ['mapo_tofu', 200], ['greens', 200, 'stirfried']],
  [['sweet_potato', 200], ['chicken_breast', 130, 'grilled'], ['broccoli', 150]],
  [['dumplings', 220], ['cucumber', 150]],
  [['noodles', 200], ['pepper_pork', 180]],
  [['rice', 120], ['white_fish', 150], ['spinach', 150, 'stirfried']],
];
const SNACK = [[['banana', 120]], [['almonds', 20]], [['greek_yogurt', 170]], [['apple', 180]]];
const START_WEIGHTS = { goblet_squat: 8, db_floor_press: 6, db_row: 8, db_rdl: 10, db_split_squat: 5, db_shoulder_press: 4 };

export function demoProfile(today) {
  return {
    sex: 'female', age: 28, heightCm: 165, weightKg: 72.4, goalKg: 63, targetDate: addDays(today, 200),
    activity: 'light', experience: 'beginner', equipment: 'dumbbells', trainDays: [0, 2, 4], sessionMin: 40,
    injuries: [], diet: 'none', allergies: '', bedtime: '23:30', wake: '07:30',
    screening: { pregnant: false, eatingDisorder: false, diabetesMeds: false, otherCondition: false },
    fitnessTest: { pushups: 4, squats: 18, plankSec: 40 },
  };
}

export function createDemoUser(db, today, lang = 'zh') {
  const rnd = prng(crypto.randomBytes(4).readUInt32LE());
  const email = `demo+${crypto.randomBytes(6).toString('hex')}@glidepath.local`;
  // the demo shows every optional measure, so people can see what they would get
  const tracking = JSON.stringify({ waist: true, cycle: true, sleepQuality: true, water: true, cycleKind: 'natural', introDismissed: true });
  const uid = db.prepare('INSERT INTO users (email, pass, is_demo, lang, units, tracking, created_at) VALUES (?, ?, 1, ?, ?, ?, ?)')
    .run(email, hashPassword(crypto.randomBytes(18).toString('base64')), lang === 'en' ? 'en' : 'zh', 'metric', tracking, Date.now()).lastInsertRowid;

  const start = addDays(today, -27);
  const profile = demoProfile(start);
  saveProfile(db, uid, profile);
  const plan = createPlan(db, uid, profile, evaluateGoal(profile, start).recommended, start);
  const target = plan.targets.calories;

  // periods every 29 days; the next one is due in four days, so today sits in the premenstrual week
  const periodStarts = [addDays(today, -54), addDays(today, -25)];
  const premenstrual = (date) => periodStarts.concat(addDays(today, 4)).some((p) => {
    const d = daysBetween(p, date);
    return d >= -6 && d <= 2;
  });

  const seed = db.transaction(() => {
    for (const p of periodStarts) savePeriod(db, uid, { start: p, end: addDays(p, 4) }, today);
    for (let i = 0; i <= 27; i++) {
      const date = addDays(start, i);
      const isToday = date === today;

      // weight: ~0.36 kg/week down, with day-to-day water swings (more before a period); some days skipped
      if (i === 0 || isToday || rnd() > 0.15) {
        const swing = (rnd() - 0.5) * 0.8 + (weekday(date) === 0 ? 0.25 : 0) + (premenstrual(date) ? 0.6 : 0);
        setWeight(db, uid, date, Math.round((72.4 - (0.36 / 7) * i + swing) * 10) / 10);
      }
      if (i % 7 === 0) setWaist(db, uid, date, Math.round((88 - i * 0.07 + (rnd() - 0.5) * 0.4) * 10) / 10);

      // meals
      const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
      const meals = [['breakfast', pick(BREAKFAST)]];
      if (!isToday) {
        meals.push(['lunch', pick(LUNCH)], ['dinner', pick(DINNER)]);
        if (weekday(date) === 5) meals.push(['snack', [['bubble_tea', 500]]]);
        else if (rnd() < 0.6) meals.push(['snack', pick(SNACK)]);
      }
      for (const [meal, items] of meals) {
        for (const [foodId, grams, cooking] of items) {
          addFood(db, uid, date, meal, { foodId, grams, cooking: cooking || 'plain', source: i % 3 === 0 ? 'photo' : 'db' });
        }
      }
      // keep the days near the target like a real person would (trim the snack on big days)
      const total = dayTotals(db, uid, date, date)[0].kcal;
      if (!isToday && total > target + 250) {
        db.prepare("DELETE FROM food_entries WHERE user_id = ? AND date = ? AND meal = 'snack' AND food_id != 'bubble_tea'").run(uid, date);
      }

      if (!isToday) {
        const sleepHours = Math.round((6.3 + rnd() * 1.9) * 10) / 10;
        setDaily(db, uid, date, {
          steps: Math.round(5500 + rnd() * 5500),
          sleepHours,
          sleepQuality: sleepHours < 6.7 ? 1 : sleepHours < 7.4 ? 2 : 3,
          waterMl: Math.round(4 + rnd() * 5) * 250,
        });
      } else {
        setDaily(db, uid, date, { sleepHours: 7.5, sleepQuality: 3, waterMl: 750 });
      }

      // workouts on planned days, most of them done
      if (!isToday && plan.training.week[weekday(date)] && rnd() < 0.85) {
        const day = resolveDay(getPlan(db, uid).training, weekday(date), getState(db, uid));
        const sets = [];
        for (const s of day.slots) {
          const ex = EXERCISES[s.exerciseId];
          for (let k = 0; k < s.sets; k++) {
            const miss = rnd() < 0.12 && k === s.sets - 1;
            if (ex.type === 'reps') sets.push({ slot: s.slot, reps: miss ? Math.max(1, s.reps - 2) : s.reps + (rnd() < 0.3 ? 1 : 0), weight: ex.weighted ? (s.weight ?? START_WEIGHTS[s.exerciseId] ?? 5) : null });
            else if (ex.type === 'time') sets.push({ slot: s.slot, secs: miss ? s.secs - 5 : s.secs });
            else sets.push({ slot: s.slot, minutes: s.minutes });
          }
        }
        logWorkout(db, uid, date, sets);
      }
    }
  });
  seed();
  return { id: uid, email };
}

export function purgeDemoUsers(db) {
  return db.prepare('DELETE FROM users WHERE is_demo = 1 AND created_at < ?').run(Date.now() - DEMO_TTL_MS).changes;
}
