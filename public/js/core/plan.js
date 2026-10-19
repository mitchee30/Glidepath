// Energy math, safety screening, feasibility check and plan targets.
// Shared by the browser and the server (plain ES module, no dependencies).

import { addDays, daysBetween, isISODate } from './dates.js';

export const KCAL_PER_KG = 7700; // ~energy in 1 kg of body fat

export const ACTIVITY = {
  sedentary: 1.2,   // desk job, little walking
  light: 1.375,     // on feet sometimes, light exercise 1-3 d/wk
  moderate: 1.55,   // active job or exercise 3-5 d/wk
  active: 1.725,    // physical job or hard exercise 6-7 d/wk
};

export const LIMITS = {
  maxWeeklyPct: 0.01,     // never plan faster than 1% of body weight per week
  steadyWeeklyPct: 0.005, // the "steady" option
  minGoalBmi: 18.5,
  minIntake: { female: 1200, male: 1500, other: 1350 },
  maxWeeks: 520,
};

export const STEPS_BY_ACTIVITY = { sedentary: 7000, light: 8000, moderate: 9000, active: 10000 };

export const PROTEIN_G_PER_KG = [1.6, 2.2]; // per kg of goal weight

const round = (x, step = 1) => Math.round(x / step) * step;
// intake targets round UP to the next 10 kcal so rounding never dips under the floor
const ceil10 = (x) => Math.ceil(x / 10) * 10;

export function bmr({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === 'male') return base + 5;
  if (sex === 'female') return base - 161;
  return base - 78; // midpoint of the two formulas
}

export function tdee(profile, weightKg = profile.weightKg) {
  return bmr({ ...profile, weightKg }) * (ACTIVITY[profile.activity] ?? ACTIVITY.sedentary);
}

export function bmi(weightKg, heightCm) {
  return weightKg / (heightCm / 100) ** 2;
}

export function weightAtBmi(b, heightCm) {
  return b * (heightCm / 100) ** 2;
}

/** Lowest daily intake the app will ever plan: max(BMR, fixed floor). */
export function intakeFloor(profile, weightKg = profile.weightKg) {
  return Math.max(bmr({ ...profile, weightKg }), LIMITS.minIntake[profile.sex] ?? LIMITS.minIntake.other);
}

// ---------------------------------------------------------------- validation

const RANGES = {
  age: [18, 100], heightCm: [120, 230], weightKg: [30, 300], goalKg: [30, 300], sessionMin: [10, 120],
};

/** Returns a list of field names that are missing or out of range. Age < 18 is
 *  not a validation error: it is handled by screening so we can explain why. */
export function validateProfile(p) {
  const bad = [];
  if (!['female', 'male', 'other'].includes(p.sex)) bad.push('sex');
  if (!Number.isFinite(p.age) || p.age < 10 || p.age > RANGES.age[1]) bad.push('age');
  for (const k of ['heightCm', 'weightKg', 'goalKg', 'sessionMin']) {
    const [lo, hi] = RANGES[k];
    if (!Number.isFinite(p[k]) || p[k] < lo || p[k] > hi) bad.push(k);
  }
  if (!isISODate(p.targetDate)) bad.push('targetDate');
  if (!(p.activity in ACTIVITY)) bad.push('activity');
  if (!['beginner', 'intermediate', 'advanced'].includes(p.experience)) bad.push('experience');
  if (!['none', 'dumbbells', 'gym'].includes(p.equipment)) bad.push('equipment');
  if (!Array.isArray(p.trainDays) || p.trainDays.length > 6 ||
      p.trainDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) bad.push('trainDays');
  if (!/^\d{2}:\d{2}$/.test(p.bedtime || '')) bad.push('bedtime');
  if (!/^\d{2}:\d{2}$/.test(p.wake || '')) bad.push('wake');
  return bad;
}

// ----------------------------------------------------------------- screening

/**
 * blocked  -> no calorie-deficit plan at all; show why and where to get help
 * caution  -> plan allowed only after the user confirms they will check with a doctor
 */
export function screen(p) {
  const blocked = [];
  const caution = [];
  const s = p.screening || {};
  if (p.age < 18) blocked.push('minor');
  if (s.pregnant) blocked.push('pregnant');
  if (s.eatingDisorder) blocked.push('eatingDisorder');
  if (bmi(p.weightKg, p.heightCm) < LIMITS.minGoalBmi) blocked.push('underweight');
  if (s.diabetesMeds) caution.push('diabetesMeds');
  if (s.otherCondition) caution.push('otherCondition');
  if (p.age >= 65) caution.push('older');
  if (bmi(p.weightKg, p.heightCm) >= 40) caution.push('highBmi');
  return { status: blocked.length ? 'blocked' : caution.length ? 'caution' : 'ok', blocked, caution };
}

// ---------------------------------------------------------------- simulation

/**
 * Week-by-week projection at a fixed % of current body weight per week.
 * As weight drops, TDEE drops too, and the deficit is capped so intake never
 * goes under the floor. Returns null if no deficit is possible at all.
 */
export function simulate(p, startKg, goalKg, weeklyPct, maxDays = LIMITS.maxWeeks * 7) {
  let w = startKg;
  let days = 0;
  let first = null;
  let floorCapped = false;
  while (w > goalKg + 1e-9 && days < maxDays) {
    const t = tdee(p, w);
    const floor = intakeFloor(p, w);
    let deficit = (weeklyPct * w * KCAL_PER_KG) / 7;
    if (t - deficit < floor) {
      deficit = Math.max(0, t - floor);
      floorCapped = true;
    }
    if (deficit < 1) break;
    if (!first) first = { tdee: t, deficit, intake: t - deficit, floor };
    const perDay = deficit / KCAL_PER_KG;
    const weekLoss = perDay * 7;
    if (w - weekLoss <= goalKg) {
      days += Math.ceil((w - goalKg) / perDay);
      w = goalKg;
      break;
    }
    w -= weekLoss;
    days += 7;
  }
  if (!first) return null;
  return { days, reached: w <= goalKg + 1e-9, endKg: w, first, floorCapped };
}

/** Weight after `days` at a weekly %, with the same floor cap. */
export function weightAfter(p, startKg, weeklyPct, days) {
  let w = startKg;
  for (let d = 0; d < days; d += 7) {
    const span = Math.min(7, days - d);
    const t = tdee(p, w);
    let deficit = (weeklyPct * w * KCAL_PER_KG) / 7;
    deficit = Math.min(deficit, Math.max(0, t - intakeFloor(p, w)));
    w -= (deficit * span) / KCAL_PER_KG;
  }
  return w;
}

// --------------------------------------------------------------- feasibility

/**
 * Checks the user's own goal + date and builds 2-3 pace options.
 * Never returns an option faster than LIMITS.maxWeeklyPct or below the intake floor.
 */
export function evaluateGoal(p, today) {
  const result = { today, issues: [], options: [], adjustedGoalKg: null, mode: 'loss' };
  const minGoal = Math.ceil(weightAtBmi(LIMITS.minGoalBmi, p.heightCm) * 2) / 2;
  let goal = p.goalKg;

  if (goal >= p.weightKg - 0.5) {
    result.mode = 'maintain';
    return result;
  }
  if (bmi(goal, p.heightCm) < LIMITS.minGoalBmi) {
    result.issues.push('goalBmiTooLow');
    goal = minGoal;
    result.adjustedGoalKg = goal;
    if (goal >= p.weightKg - 0.5) {
      result.mode = 'maintain';
      return result;
    }
  }

  const kg = p.weightKg - goal;
  const t0 = tdee(p);
  const floor0 = intakeFloor(p);
  const days = daysBetween(today, p.targetDate);
  result.requested = null;

  if (days < 7) {
    result.issues.push('dateTooSoon');
  } else if (!result.adjustedGoalKg) {
    const weeklyKg = (kg / days) * 7;
    const weeklyPct = weeklyKg / p.weightKg;
    const deficit = (kg * KCAL_PER_KG) / days;
    const intake = t0 - deficit;
    result.requested = { days, weeklyKg, weeklyPct, deficit, intake };
    if (weeklyPct > LIMITS.maxWeeklyPct + 1e-9) result.issues.push('tooFast');
    if (intake < floor0 - 1e-9) result.issues.push('belowFloor');
  }

  const maxDeficit0 = t0 - floor0;
  if (maxDeficit0 < 150) result.issues.push('smallBudget');

  const mk = (id, goalKg, sim, weeklyPct) => ({
    id,
    goalKg,
    weeklyPct,
    days: sim.days,
    endDate: addDays(today, sim.days),
    reached: sim.reached,
    intake: ceil10(sim.first.intake),
    deficit: round(sim.first.tdee - ceil10(sim.first.intake)),
    weeklyKg: (sim.first.deficit * 7) / KCAL_PER_KG,
    floorCapped: sim.floorCapped,
  });

  const feasible = result.requested && !result.issues.includes('tooFast') && !result.issues.includes('belowFloor');
  if (feasible) {
    // the user's own pace: a constant kg/week that lands exactly on their date
    const r = result.requested;
    result.options.push({
      id: 'requested', goalKg: goal, weeklyPct: r.weeklyPct, days: r.days, endDate: p.targetDate, reached: true,
      intake: ceil10(r.intake), deficit: round(t0 - ceil10(r.intake)), weeklyKg: r.weeklyKg, floorCapped: false,
    });
  }

  const steady = simulate(p, p.weightKg, goal, LIMITS.steadyWeeklyPct);
  if (steady && steady.reached) result.options.push(mk('steady', goal, steady, LIMITS.steadyWeeklyPct));

  const faster = simulate(p, p.weightKg, goal, LIMITS.maxWeeklyPct);
  if (faster && faster.reached) result.options.push(mk('faster', goal, faster, LIMITS.maxWeeklyPct));

  if (!feasible && days >= 7 && !result.adjustedGoalKg) {
    // keep the date, aim for what is safely reachable by then
    const reach = weightAfter(p, p.weightKg, LIMITS.maxWeeklyPct, days);
    const milestone = Math.ceil(reach * 2) / 2;
    if (milestone < p.weightKg - 0.5 && milestone > goal) {
      const sim = simulate(p, p.weightKg, milestone, LIMITS.maxWeeklyPct);
      if (sim) result.options.push(mk('milestone', milestone, sim, LIMITS.maxWeeklyPct));
    }
  }

  // drop options that land within a week of an earlier one (same goal)
  const seen = [];
  result.options = result.options.filter((o) => {
    const dup = seen.some((s) => s.goalKg === o.goalKg && Math.abs(s.days - o.days) < 7);
    if (!dup) seen.push(o);
    return !dup;
  });
  result.recommended = feasible ? 'requested' : result.options.find((o) => o.id === 'steady') ? 'steady' : result.options[0]?.id ?? null;
  result.feasible = !!feasible;
  return result;
}

// ------------------------------------------------------------------- targets

export function sleepHours(bedtime, wake) {
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

export function proteinTarget(goalKg) {
  return { min: round(goalKg * PROTEIN_G_PER_KG[0], 5), max: round(goalKg * PROTEIN_G_PER_KG[1], 5) };
}

/** Daily intake for a weekly % at the given weight (floor-capped). */
export function intakeFor(p, weightKg, weeklyPct) {
  const t = tdee(p, weightKg);
  const deficit = Math.min((weeklyPct * weightKg * KCAL_PER_KG) / 7, Math.max(0, t - intakeFloor(p, weightKg)));
  return { tdee: t, deficit, intake: t - deficit, floor: intakeFloor(p, weightKg) };
}

/**
 * Builds the nutrition / steps / sleep targets for a chosen option.
 * `weightKg` lets us re-run this later with the current trend weight.
 */
export function buildTargets(p, option, weightKg = p.weightKg) {
  const e = intakeFor(p, weightKg, option.weeklyPct);
  const sleep = sleepHours(p.bedtime, p.wake);
  return {
    phase: 'loss',
    weeklyPct: option.weeklyPct,
    goalKg: option.goalKg,
    basedOnKg: Math.round(weightKg * 10) / 10,
    bmr: round(bmr({ ...p, weightKg })),
    tdee: round(e.tdee, 10),
    floor: round(e.floor, 10),
    calories: ceil10(e.intake),
    deficit: Math.max(0, round(e.tdee - ceil10(e.intake))),
    protein: proteinTarget(option.goalKg),
    steps: STEPS_BY_ACTIVITY[p.activity] ?? 8000,
    sleep: { bedtime: p.bedtime, wake: p.wake, hours: Math.round(sleep * 10) / 10, enough: sleep >= 7 },
  };
}

/** Maintenance: walk calories back up ~150 kcal per week until they reach TDEE. */
export function maintenanceTargets(p, prev, weightKg, daysSinceStart) {
  const t = tdee(p, weightKg);
  const lossCalories = prev.lossCalories ?? prev.calories;
  const steps = Math.floor(Math.max(0, daysSinceStart) / 7) + 1;
  const calories = Math.min(t, lossCalories + 150 * steps);
  return {
    ...prev,
    phase: 'maintain',
    basedOnKg: Math.round(weightKg * 10) / 10,
    tdee: round(t, 10),
    calories: round(calories, 10),
    deficit: round(Math.max(0, t - calories), 10),
    lossCalories,
  };
}

/** Projected finish date at the plan's pace from the current trend weight. */
export function projectEnd(p, targets, weightKg, today) {
  if (weightKg <= targets.goalKg) return today;
  const sim = simulate(p, weightKg, targets.goalKg, targets.weeklyPct);
  return sim && sim.reached ? addDays(today, sim.days) : null;
}
