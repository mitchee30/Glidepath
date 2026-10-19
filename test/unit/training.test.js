import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, SLOTS, buildTrainingPlan, resolveDay, progress, pickExercise, canDo } from '../../public/js/core/training.js';

const p = (over = {}) => ({ experience: 'beginner', equipment: 'none', injuries: [], trainDays: [0, 2, 4], sessionMin: 30, fitnessTest: null, ...over });

test('library: every slot candidate exists and every progression target exists', () => {
  for (const [slot, ids] of Object.entries(SLOTS)) for (const id of ids) assert.ok(EXERCISES[id], `${slot}: ${id}`);
  for (const [id, ex] of Object.entries(EXERCISES)) {
    for (const h of ex.harder || []) assert.ok(EXERCISES[h], `${id} -> ${h}`);
    assert.ok(ex.cues.zh.length >= 2 && ex.cues.en.length === ex.cues.zh.length, id);
    assert.ok(ex.range[0] < ex.range[1], id);
  }
});

test('3 days at home -> A / B / A full-body days on the chosen weekdays', () => {
  const plan = buildTrainingPlan(p());
  assert.deepEqual(Object.keys(plan.week), ['0', '2', '4']);
  assert.deepEqual([0, 2, 4].map((d) => plan.week[d].key), ['A', 'B', 'A']);
  for (const d of [0, 2, 4]) {
    const day = plan.week[d];
    assert.ok(day.slots.length >= 3);
    for (const s of day.slots) {
      assert.equal(EXERCISES[s.exerciseId].equip, 'none');
      assert.equal(s.sets, 2);
    }
    assert.ok(day.minutes <= 30 + 3, `minutes ${day.minutes}`);
  }
});

test('4-6 days use upper/lower splits and cardio days', () => {
  assert.deepEqual(Object.values(buildTrainingPlan(p({ trainDays: [0, 1, 3, 4] })).week).map((d) => d.key), ['upper', 'lower', 'upper', 'lower']);
  const six = buildTrainingPlan(p({ trainDays: [0, 1, 2, 3, 4, 5] }));
  assert.deepEqual(Object.values(six.week).map((d) => d.key), ['upper', 'lower', 'cardio', 'upper', 'lower', 'cardio']);
  const cardio = six.week[2];
  assert.equal(cardio.slots[0].exerciseId, 'brisk_walk');
  assert.ok(cardio.slots[0].minutes >= 10);
});

test('knee injury removes knee-loading moves; wrist injury at home removes push-ups', () => {
  const knee = buildTrainingPlan(p({ injuries: ['knee'], equipment: 'gym' }));
  const ids = Object.values(knee.week).flatMap((d) => d.slots.map((s) => s.exerciseId));
  for (const id of ids) assert.ok(!(EXERCISES[id].avoid || []).includes('knee'), id);
  assert.ok(ids.includes('box_squat'));
  assert.ok(knee.notes.includes('injury'));

  const wrist = buildTrainingPlan(p({ injuries: ['wrist'] }));
  const wids = Object.values(wrist.week).flatMap((d) => d.slots.map((s) => s.exerciseId));
  assert.ok(!wids.some((id) => id.includes('pushup')));
});

test('fitness test picks the push-up variation and plank time', () => {
  assert.equal(pickExercise('push', p({ fitnessTest: { pushups: 0 } })), 'wall_pushup');
  assert.equal(pickExercise('push', p({ fitnessTest: { pushups: 3 } })), 'incline_pushup');
  assert.equal(pickExercise('push', p({ fitnessTest: { pushups: 7 } })), 'knee_pushup');
  assert.equal(pickExercise('push', p({ fitnessTest: { pushups: 20 } })), 'pushup');
  assert.equal(pickExercise('push', p({ equipment: 'dumbbells' })), 'db_floor_press');
  assert.equal(pickExercise('squat', p({ fitnessTest: { squats: 6 } })), 'box_squat');
  const plan = buildTrainingPlan(p({ fitnessTest: { plankSec: 50 } }));
  const plank = plan.week[0].slots.find((s) => s.exerciseId === 'plank');
  assert.equal(plank.secs, 30);
});

test('pike push-ups are for intermediate and up', () => {
  assert.equal(canDo('pike_pushup', p()), false);
  assert.equal(canDo('pike_pushup', p({ experience: 'intermediate' })), true);
});

test('longer sessions fit more exercises; advanced gets an extra set on main lifts', () => {
  const short = buildTrainingPlan(p({ sessionMin: 20, equipment: 'gym' })).week[0].slots.length;
  const long = buildTrainingPlan(p({ sessionMin: 75, equipment: 'gym' })).week[0].slots.length;
  assert.ok(long > short, `${short} vs ${long}`);
  const adv = buildTrainingPlan(p({ experience: 'advanced', equipment: 'gym', sessionMin: 75 })).week[0].slots;
  assert.equal(adv.find((s) => s.slot === 'squat').sets, 4);
  assert.equal(adv.find((s) => s.slot === 'core_a').sets, 3);
});

test('progression: +1 rep when every set hits the target', () => {
  const t = { exerciseId: 'bw_squat', sets: 2, reps: 12 };
  const r = progress(t, [{ reps: 12 }, { reps: 13 }], p());
  assert.equal(r.change, 'reps');
  assert.equal(r.reps, 13);
});

test('progression: missed reps or skipped sets keep the target', () => {
  const t = { exerciseId: 'bw_squat', sets: 2, reps: 12 };
  assert.equal(progress(t, [{ reps: 12 }, { reps: 9 }], p()).change, 'same');
  assert.equal(progress(t, [{ reps: 15 }], p()).change, 'same');
});

test('progression: weighted lifts add weight at the top of the range and reset reps', () => {
  const t = { exerciseId: 'goblet_squat', sets: 3, reps: 12, weight: 10 };
  const r = progress(t, [{ reps: 12, weight: 10 }, { reps: 12, weight: 10 }, { reps: 12, weight: 10 }], p({ equipment: 'dumbbells' }));
  assert.equal(r.change, 'weight');
  assert.equal(r.weight, 12);
  assert.equal(r.reps, 8);
});

test('progression: first weighted session records the weight used', () => {
  const t = { exerciseId: 'db_row', sets: 2, reps: 8, weight: null };
  const r = progress(t, [{ reps: 8, weight: 8 }, { reps: 8, weight: 8 }], p({ equipment: 'dumbbells' }));
  assert.equal(r.weight, 8);
  assert.equal(r.reps, 9);
});

test('progression: bodyweight moves graduate to the harder variation', () => {
  const t = { exerciseId: 'knee_pushup', sets: 2, reps: 15 };
  const r = progress(t, [{ reps: 15 }, { reps: 16 }], p());
  assert.equal(r.change, 'harder');
  assert.equal(r.exerciseId, 'pushup');
  assert.equal(r.reps, 8);
  // standard push-ups have nowhere further to go in v1
  assert.equal(progress({ exerciseId: 'pushup', sets: 2, reps: 15 }, [{ reps: 15 }, { reps: 15 }], p()).change, 'maxed');
  // harder variation the user cannot do (knee injury) is skipped
  assert.equal(progress({ exerciseId: 'box_squat', sets: 2, reps: 15 }, [{ reps: 15 }, { reps: 15 }], p({ injuries: ['knee'] })).change, 'maxed');
});

test('progression: planks +5 s, walks +5 min, both capped', () => {
  assert.equal(progress({ exerciseId: 'plank', sets: 2, secs: 30 }, [{ secs: 30 }, { secs: 35 }], p()).secs, 35);
  assert.equal(progress({ exerciseId: 'plank', sets: 2, secs: 60 }, [{ secs: 60 }, { secs: 60 }], p()).change, 'maxed');
  assert.equal(progress({ exerciseId: 'brisk_walk', sets: 1, minutes: 20 }, [{ minutes: 22 }], p()).minutes, 25);
});

test('resolveDay merges saved progress into the plan', () => {
  const plan = buildTrainingPlan(p({ fitnessTest: { pushups: 7 } }));
  const day = resolveDay(plan, 0, { push: { exerciseId: 'pushup', reps: 9 } });
  const push = day.slots.find((s) => s.slot === 'push');
  assert.equal(push.exerciseId, 'pushup');
  assert.equal(push.reps, 9);
  assert.equal(resolveDay(plan, 1, {}), null);
});
