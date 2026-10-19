import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RepCounter, COUNTABLE, measure, angle3, P } from '../../public/js/core/reps.js';
import { EXERCISES } from '../../public/js/core/training.js';

// Real MediaPipe Pose (lite) output for the free-exercise-db demo photos,
// captured once in Chromium. Keys are "<photo>/<frame>".
const REAL = JSON.parse(fs.readFileSync(new URL('../fixtures/pose-frames.json', import.meta.url)));

/** Plays photos as video: each held for `holdMs` at 15 fps. */
function play(counter, keys, holdMs = 900) {
  const events = [];
  let t = 0;
  let last;
  for (const k of keys) {
    for (let f = 0; f < (holdMs / 1000) * 15; f++) {
      last = counter.update({ ...REAL[k], t });
      if (last.event) events.push(last.event);
      if (last.cue) events.push(`cue:${last.cue}`);
      t += 1000 / 15;
    }
  }
  return { events, last };
}

test('countable exercises all exist in the exercise library', () => {
  for (const id of Object.keys(COUNTABLE)) assert.ok(EXERCISES[id], id);
});

test('real frames: joint angles land on the right side of the thresholds', () => {
  const squat = COUNTABLE.bw_squat;
  const pushup = COUNTABLE.pushup;
  for (const k of ['Bodyweight_Squat/0', 'Goblet_Squat/0', 'Sit_Squats/0']) assert.ok(measure(squat, REAL[k]).angle >= squat.top, k);
  for (const k of ['Bodyweight_Squat/1', 'Goblet_Squat/1']) assert.ok(measure(squat, REAL[k]).angle <= squat.bottom, k);
  const half = measure(squat, REAL['Sit_Squats/1']).angle;
  assert.ok(half > squat.bottom && half < squat.top - 10, `half squat ${half}`);
  for (const k of ['Pushups/0', 'Incline_Push-Up/1']) assert.ok(measure(pushup, REAL[k]).angle >= pushup.top, k);
  for (const k of ['Pushups/1', 'Incline_Push-Up/0']) assert.ok(measure(pushup, REAL[k]).angle <= pushup.bottom, k);
});

test('real frames: bodyweight and goblet squats are counted', () => {
  const a = play(new RepCounter('bw_squat'), ['Bodyweight_Squat/0', 'Bodyweight_Squat/1', 'Bodyweight_Squat/0', 'Bodyweight_Squat/1', 'Bodyweight_Squat/0']);
  assert.equal(a.last.count, 2);
  const b = play(new RepCounter('goblet_squat'), ['Goblet_Squat/0', 'Goblet_Squat/1', 'Goblet_Squat/0', 'Goblet_Squat/1', 'Goblet_Squat/0', 'Goblet_Squat/1', 'Goblet_Squat/0']);
  assert.equal(b.last.count, 3);
  assert.deepEqual(b.events, ['rep', 'rep', 'rep']);
});

test('real frames: a half squat is not counted and asks to go deeper', () => {
  const r = play(new RepCounter('bw_squat'), ['Sit_Squats/0', 'Sit_Squats/1', 'Sit_Squats/0']);
  assert.equal(r.last.count, 0);
  assert.equal(r.last.partials, 1);
  assert.deepEqual(r.events, ['partial', 'cue:deeper']);
});

test('real frames: push-ups and incline push-ups are counted', () => {
  const a = play(new RepCounter('pushup'), ['Pushups/0', 'Pushups/1', 'Pushups/0', 'Pushups/1', 'Pushups/0']);
  assert.equal(a.last.count, 2);
  // the incline photos start at the bottom: the first rep only counts after reaching the top first
  const b = play(new RepCounter('incline_pushup'), ['Incline_Push-Up/0', 'Incline_Push-Up/1', 'Incline_Push-Up/0', 'Incline_Push-Up/1']);
  assert.equal(b.last.count, 1);
});

// ------------------------------------------------------------ synthetic frames

/** Builds a side-view frame with the knee (squat) or elbow (push-up) at `deg`. */
function synth(kind, deg, { visibility = 0.95, sag = 0 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
  const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  const set = (i, x, y, v = visibility) => {
    lm[i] = { x: 0.5 + x / 4, y: 0.5 + y / 4, z: 0, visibility: v };
    world[i] = { x, y, z: 0 };
  };
  const r = (d) => (d * Math.PI) / 180;
  if (kind === 'squat') {
    // knee at origin, hip straight up, ankle rotated so the knee angle is `deg`
    for (const [hip, knee, ankle] of [[P.lHip, P.lKnee, P.lAnkle], [P.rHip, P.rKnee, P.rAnkle]]) {
      set(knee, 0, 0);
      set(hip, 0, -0.45);
      set(ankle, 0.45 * Math.sin(r(180 - deg)), 0.45 * Math.cos(r(180 - deg)));
    }
  } else {
    // horizontal body; elbow below the shoulder; hip sags by `sag` metres
    set(P.lShoulder, 0, 0);
    set(P.lHip, 0.5, sag);
    set(P.lAnkle, 1.1, 0);
    set(P.lKnee, 0.8, sag / 2);
    set(P.lElbow, 0, 0.28);
    // wrist placed so the elbow angle is `deg`
    set(P.lWrist, 0.28 * Math.sin(r(180 - deg)), 0.28 + 0.28 * Math.cos(r(180 - deg)));
    for (const i of [P.rShoulder, P.rHip, P.rAnkle, P.rKnee, P.rElbow, P.rWrist]) lm[i].visibility = 0.05;
  }
  return { landmarks: lm, world, aspect: 1 };
}

function run(id, kind, degs, opts = {}, stepMs = 66) {
  const c = new RepCounter(id);
  const events = [];
  let t = 0;
  let last;
  for (const d of degs) {
    const o = typeof opts === 'function' ? opts(t) : opts;
    last = c.update({ ...synth(kind, d, o), t });
    if (last.event) events.push(last.event);
    if (last.cue) events.push(`cue:${last.cue}`);
    t += stepMs;
  }
  return { events, last };
}

const ramp = (from, to, n = 10) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
const rep = (top, bottom) => [...ramp(top, bottom), ...ramp(bottom, top)];

test('synthetic: geometry helper produces the requested angle', () => {
  const f = synth('squat', 95);
  assert.ok(Math.abs(angle3(f.world[P.lHip], f.world[P.lKnee], f.world[P.lAnkle]) - 95) < 0.01);
  const g = synth('pushup', 80);
  assert.ok(Math.abs(angle3(g.world[P.lShoulder], g.world[P.lElbow], g.world[P.lWrist]) - 80) < 0.01);
});

test('synthetic: needs a starting top position before counting', () => {
  const r = run('bw_squat', 'squat', [...ramp(120, 80), ...ramp(80, 165), ...rep(165, 85), 165]);
  assert.equal(r.last.count, 1);
});

test('synthetic: five clean squats', () => {
  const r = run('bw_squat', 'squat', [165, ...rep(165, 85), ...rep(165, 85), ...rep(165, 85), ...rep(165, 85), ...rep(165, 85), 165]);
  assert.equal(r.last.count, 5);
  assert.equal(r.last.partials, 0);
});

test('synthetic: box squats count at a higher bottom', () => {
  assert.equal(run('box_squat', 'squat', [165, ...rep(165, 106), 165]).last.count, 1);
  assert.equal(run('bw_squat', 'squat', [165, ...rep(165, 106), 165]).last.count, 0);
});

test('synthetic: small wobbles near the top are ignored', () => {
  const wobble = [165, 160, 150, 145, 150, 160, 165, 158, 150, 162, 165];
  const r = run('bw_squat', 'squat', wobble);
  assert.equal(r.last.count, 0);
  assert.equal(r.last.partials, 0);
});

test('synthetic: a twitch faster than 0.4 s is not a rep', () => {
  const r = run('bw_squat', 'squat', [165, 165, 90, 165, 165], {}, 50);
  assert.equal(r.last.count, 0);
});

test('synthetic: not visible pauses counting, and a long gap abandons the rep', () => {
  // goes down, disappears for 2 s, comes back standing: no rep
  const hidden = (t) => (t > 700 && t < 2700 ? { visibility: 0.2 } : {});
  const r = run('bw_squat', 'squat', [165, ...ramp(165, 85), ...Array(30).fill(85), ...ramp(85, 165), 165], hidden);
  assert.equal(r.last.count, 0);
  const status = new RepCounter('bw_squat').update({ ...synth('squat', 165, { visibility: 0.3 }), t: 0 }).status;
  assert.equal(status, 'notVisible');
});

test('synthetic: push-ups with sagging hips get a cue, but still count', () => {
  const r = run('pushup', 'pushup', [165, ...rep(165, 80), 165], { sag: 0.18 });
  assert.equal(r.last.count, 1);
  assert.deepEqual(r.events, ['rep', 'cue:hipsSag']);
  const high = run('pushup', 'pushup', [165, ...rep(165, 80), 165], { sag: -0.18 });
  assert.deepEqual(high.events, ['rep', 'cue:hipsHigh']);
  const clean = run('pushup', 'pushup', [165, ...rep(165, 80), 165], { sag: 0 });
  assert.deepEqual(clean.events, ['rep']);
});

test('synthetic: low confidence counts but never judges form', () => {
  const r = run('pushup', 'pushup', [165, ...rep(165, 80), 165], { sag: 0.18, visibility: 0.6 });
  assert.equal(r.last.count, 1);
  assert.deepEqual(r.events, ['rep']);
});

test('synthetic: partial push-up asks to go lower', () => {
  const r = run('pushup', 'pushup', [165, ...rep(165, 120), 165]);
  assert.equal(r.last.count, 0);
  assert.deepEqual(r.events, ['partial', 'cue:deeper']);
});
