import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bmr, tdee, intakeFloor, evaluateGoal, screen, buildTargets, maintenanceTargets, sleepHours,
  validateProfile, simulate, LIMITS, weightAtBmi,
} from '../../public/js/core/plan.js';
import { addDays } from '../../public/js/core/dates.js';

const TODAY = '2026-10-18';
const base = {
  sex: 'female', age: 28, heightCm: 165, weightKg: 72, goalKg: 62, targetDate: addDays(TODAY, 30),
  activity: 'light', experience: 'beginner', equipment: 'dumbbells', trainDays: [0, 2, 4], sessionMin: 40,
  injuries: [], bedtime: '23:30', wake: '07:30', screening: {},
};

test('Mifflin-St Jeor BMR matches hand calculation', () => {
  // 10*70 + 6.25*165 - 5*30 - 161 = 1420.25
  assert.equal(bmr({ sex: 'female', weightKg: 70, heightCm: 165, age: 30 }), 1420.25);
  // 10*85 + 6.25*180 - 5*30 + 5 = 1830
  assert.equal(bmr({ sex: 'male', weightKg: 85, heightCm: 180, age: 30 }), 1830);
  const other = bmr({ sex: 'other', weightKg: 70, heightCm: 165, age: 30 });
  assert.ok(other > 1420.25 && other < 1420.25 + 166);
});

test('TDEE applies the activity factor', () => {
  assert.equal(tdee({ ...base, activity: 'sedentary' }), bmr(base) * 1.2);
  assert.equal(tdee({ ...base, activity: 'moderate' }), bmr(base) * 1.55);
});

test('intake floor is the larger of BMR and the fixed minimum', () => {
  assert.equal(intakeFloor({ ...base, weightKg: 50, heightCm: 150, age: 60 }), 1200);
  const big = { ...base, sex: 'male', weightKg: 130, heightCm: 190, age: 25 };
  assert.equal(intakeFloor(big), bmr(big));
});

test('10 kg in 30 days is refused and replaced by safe options', () => {
  const r = evaluateGoal(base, TODAY);
  assert.ok(r.issues.includes('tooFast'));
  assert.ok(r.issues.includes('belowFloor'));
  assert.equal(r.feasible, false);
  assert.ok(!r.options.find((o) => o.id === 'requested'));
  const ids = r.options.map((o) => o.id);
  assert.ok(ids.includes('steady') && ids.includes('faster') && ids.includes('milestone'), ids.join());
  for (const o of r.options) {
    assert.ok(o.weeklyPct <= LIMITS.maxWeeklyPct + 1e-9);
    assert.ok(o.intake >= intakeFloor(base), `${o.id} intake ${o.intake}`);
  }
  const milestone = r.options.find((o) => o.id === 'milestone');
  assert.ok(milestone.goalKg > 62 && milestone.goalKg < 72);
  assert.ok(Math.abs(milestone.days - 30) <= 7, `milestone days ${milestone.days}`);
  assert.equal(r.recommended, 'steady');
});

test('a gentle goal keeps the user\'s own date', () => {
  const p = { ...base, goalKg: 68, targetDate: addDays(TODAY, 120) };
  const r = evaluateGoal(p, TODAY);
  assert.equal(r.feasible, true);
  assert.deepEqual(r.issues, []);
  const req = r.options.find((o) => o.id === 'requested');
  assert.equal(req.endDate, p.targetDate);
  assert.equal(req.days, 120);
  assert.equal(r.recommended, 'requested');
  // 4 kg * 7700 / 120 days ≈ 257 kcal/day deficit
  assert.ok(Math.abs(req.deficit - 257) <= 10, `deficit ${req.deficit}`);
});

test('a goal under BMI 18.5 is raised to the BMI 18.5 weight', () => {
  const r = evaluateGoal({ ...base, goalKg: 48, targetDate: addDays(TODAY, 400) }, TODAY);
  assert.ok(r.issues.includes('goalBmiTooLow'));
  const min = weightAtBmi(18.5, 165); // 50.37
  assert.equal(r.adjustedGoalKg, 50.5);
  assert.ok(r.adjustedGoalKg >= min);
  for (const o of r.options) assert.equal(o.goalKg, 50.5);
});

test('goal at or above current weight means maintenance', () => {
  assert.equal(evaluateGoal({ ...base, goalKg: 72 }, TODAY).mode, 'maintain');
});

test('dates less than a week away are flagged', () => {
  const r = evaluateGoal({ ...base, targetDate: addDays(TODAY, 3) }, TODAY);
  assert.ok(r.issues.includes('dateTooSoon'));
  assert.ok(r.options.length >= 1);
});

test('no option ever beats 1%/week or the floor (random profiles)', () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sexes = ['female', 'male', 'other'];
  const acts = ['sedentary', 'light', 'moderate', 'active'];
  for (let i = 0; i < 400; i++) {
    const heightCm = 145 + rnd() * 50;
    const weightKg = Math.round(weightAtBmi(19 + rnd() * 25, heightCm));
    const p = {
      ...base, sex: sexes[i % 3], activity: acts[i % 4], age: 18 + Math.floor(rnd() * 60), heightCm, weightKg,
      goalKg: Math.round(weightKg * (0.6 + rnd() * 0.38)), targetDate: addDays(TODAY, 7 + Math.floor(rnd() * 500)),
    };
    const r = evaluateGoal(p, TODAY);
    for (const o of r.options) {
      assert.ok(o.weeklyPct <= LIMITS.maxWeeklyPct + 1e-9, JSON.stringify({ p, o }));
      assert.ok(o.intake >= intakeFloor(p) - 1e-9, JSON.stringify({ p, o }));
      assert.ok(o.goalKg >= weightAtBmi(18.5, p.heightCm) - 1e-9);
      const t = buildTargets(p, o);
      assert.ok(t.calories >= t.floor - 10 && t.calories >= intakeFloor(p));
    }
  }
});

test('simulation slows down as weight drops', () => {
  const sim = simulate(base, 72, 62, 0.005);
  // a constant 0.36 kg/week would take ~195 days; falling weight makes it longer
  assert.ok(sim.reached);
  assert.ok(sim.days > 195, `days ${sim.days}`);
});

test('screening blocks minors, pregnancy, eating-disorder history and underweight', () => {
  assert.deepEqual(screen({ ...base, age: 16 }).blocked, ['minor']);
  assert.equal(screen({ ...base, screening: { pregnant: true } }).status, 'blocked');
  assert.equal(screen({ ...base, screening: { eatingDisorder: true } }).status, 'blocked');
  assert.deepEqual(screen({ ...base, weightKg: 48 }).blocked, ['underweight']);
  const c = screen({ ...base, screening: { diabetesMeds: true } });
  assert.equal(c.status, 'caution');
  assert.deepEqual(c.caution, ['diabetesMeds']);
  assert.equal(screen(base).status, 'ok');
});

test('targets: protein from goal weight, steps from activity, sleep from schedule', () => {
  const r = evaluateGoal(base, TODAY);
  const t = buildTargets(base, r.options.find((o) => o.id === 'steady'));
  assert.deepEqual(t.protein, { min: 100, max: 135 }); // 62 kg * 1.6 = 99.2 -> 100; *2.2 = 136.4 -> 135
  assert.equal(t.steps, 8000);
  assert.equal(t.sleep.hours, 8);
  assert.equal(t.calories % 10, 0);
  assert.ok(t.calories < t.tdee);
});

test('maintenance walks calories back up 150 kcal a week, capped at TDEE', () => {
  const r = evaluateGoal(base, TODAY);
  const loss = buildTargets(base, r.options[0]);
  const m1 = maintenanceTargets(base, loss, 62, 0);
  assert.equal(m1.calories, Math.min(m1.tdee, Math.round((loss.calories + 150) / 10) * 10));
  const m2 = maintenanceTargets(base, m1, 62, 7);
  assert.equal(m2.calories, Math.min(m2.tdee, Math.round((loss.calories + 300) / 10) * 10));
  const m9 = maintenanceTargets(base, m2, 62, 70);
  assert.ok(Math.abs(m9.calories - m9.tdee) <= 10);
  assert.equal(m9.lossCalories, loss.calories);
});

test('sleep hours across midnight', () => {
  assert.equal(sleepHours('23:30', '07:30'), 8);
  assert.equal(sleepHours('01:00', '06:00'), 5);
  assert.equal(sleepHours('22:15', '06:45'), 8.5);
});

test('profile validation names the bad fields', () => {
  assert.deepEqual(validateProfile(base), []);
  const bad = validateProfile({ ...base, heightCm: 500, targetDate: '2026-02-30', trainDays: [7] });
  assert.deepEqual(bad.sort(), ['heightCm', 'targetDate', 'trainDays'].sort());
});
