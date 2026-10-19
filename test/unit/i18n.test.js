import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hasKey } from '../../public/js/i18n.js';

const dir = path.resolve('public/js');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'core') walk(p); } else if (f.endsWith('.js')) files.push(p);
  }
})(dir);

test('every static t() key exists in both languages', () => {
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) if (!hasKey(m[1])) missing.push(`${path.basename(f)}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('dynamic key families are complete', () => {
  const families = {
    'tab.': ['today', 'food', 'train', 'weight', 'me'],
    'units.': ['metric', 'jin', 'imperial'],
    'unit.': ['kg', 'jin', 'lb'],
    'activity.': ['sedentary', 'light', 'moderate', 'active', 'sedentary.hint', 'light.hint', 'moderate.hint', 'active.hint'],
    'diet.': ['none', 'vegetarian', 'vegan'],
    'exp.': ['beginner', 'intermediate', 'advanced', 'beginner.hint', 'intermediate.hint', 'advanced.hint'],
    'equip.': ['none', 'dumbbells', 'gym'],
    'injury.': ['knee', 'back', 'shoulder', 'wrist'],
    'ob.blocked.': ['minor', 'pregnant', 'eatingDisorder', 'underweight'],
    'ob.option.': ['requested', 'steady', 'faster', 'milestone', 'requested.desc', 'steady.desc', 'faster.desc', 'milestone.desc'],
    'ob.caution.': ['diabetesMeds', 'otherCondition', 'older', 'highBmi'],
    'ob.': ['about.title', 'goal.title', 'health.title', 'life.title', 'training.title'],
    'day.': ['A', 'B', 'upper', 'lower', 'cardio', 'short.A', 'short.B', 'short.upper', 'short.lower', 'short.cardio'],
    'meal.': ['breakfast', 'lunch', 'dinner', 'snack'],
    'cook.': ['plain', 'grilled', 'panfried', 'stirfried', 'deepfried'],
    'food.tab.': ['search', 'recent', 'custom', 'photo'],
    'signal.': ['lowIntake', 'rapidLoss'],
    'help.': ['nedic', 'alliance', 'nedic.where', 'alliance.where'],
    'weight.range.': ['30', '90', 'all'],
    'me.phase.': ['loss', 'maintain'],
    'cam.setup.': ['squat', 'pushup'],
    'cam.getReady.': ['squat', 'pushup'],
    'cam.cue.': ['deeper', 'hipsSag', 'hipsHigh', 'deeper.squat', 'deeper.pushup'],
    'cam.err.': ['unsupported', 'denied', 'noCamera', 'camera', 'model'],
  };
  const missing = [];
  for (const [prefix, keys] of Object.entries(families)) for (const k of keys) if (!hasKey(prefix + k)) missing.push(prefix + k);
  assert.deepEqual(missing, []);
});

test('every API error code the server can send has a message', () => {
  const codes = new Set();
  for (const f of ['server/api.js', 'server/store.js']) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/HttpError\(\d+, '([a-z_]+)'/g)) codes.add(m[1]);
  }
  const missing = [...codes].filter((c) => !hasKey(`err.${c}`) && !['csrf', 'unauthorized', 'not_loss', 'bad_item', 'unknown_food', 'bad_meal', 'bad_items', 'bad_slot', 'bad_reps', 'bad_secs', 'bad_minutes', 'bad_json'].includes(c));
  assert.deepEqual(missing, []);
});
