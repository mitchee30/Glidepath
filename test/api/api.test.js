import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../server/index.js';
import { addDays, localToday } from '../../public/js/core/dates.js';

let server;
let base;
let appCtx;
const fetchCalls = [];
let fakeOpenAI = null;

before(async () => {
  appCtx = createApp({
    dbPath: ':memory:', anthropicKey: null, openaiKey: 'sk-test', authLimit: 1000, demoLimit: 1000, recognizeDailyLimit: 3, log: () => {},
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, body: JSON.parse(init.body) });
      return fakeOpenAI(url, init);
    },
  });
  server = appCtx.app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  appCtx.close();
});

const TODAY = localToday(new Date(Date.now() - 12 * 3600 * 1000)); // safely "today or yesterday" for any server timezone

function client() {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + '/api' + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-glidepath': '1', ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].startsWith('sid=;') ? '' : set.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b = {}, h) => call('POST', p, b, h),
    patch: (p, b = {}) => call('PATCH', p, b),
    del: (p, b) => call('DELETE', p, b),
    get cookie() { return cookie; },
  };
}

let seq = 0;
async function newUser() {
  const c = client();
  const email = `user${Date.now()}${seq++}@example.com`;
  const r = await c.post('/auth/register', { email, password: 'longenough1' });
  assert.equal(r.status, 201);
  return { c, email };
}

const profile = (over = {}) => ({
  sex: 'male', age: 32, heightCm: 178, weightKg: 88, goalKg: 80, targetDate: addDays(TODAY, 180),
  activity: 'light', experience: 'beginner', equipment: 'dumbbells', trainDays: [0, 2, 4], sessionMin: 45,
  injuries: [], diet: 'none', allergies: '', bedtime: '23:00', wake: '07:00',
  screening: {}, fitnessTest: { pushups: 12, squats: 25, plankSec: 45 }, ...over,
});

async function userWithPlan(over = {}) {
  const u = await newUser();
  const ev = await u.c.post('/profile/evaluate', { profile: profile(over), today: TODAY });
  assert.equal(ev.status, 200, JSON.stringify(ev.data));
  const p = await u.c.post('/plan', { optionId: ev.data.evaluation.recommended, today: TODAY });
  assert.equal(p.status, 201, JSON.stringify(p.data));
  return { ...u, plan: p.data.plan };
}

// ------------------------------------------------------------------ auth

test('register, me, logout, login', async () => {
  const { c, email } = await newUser();
  let me = await c.get('/me');
  assert.equal(me.data.user.email, email);
  assert.equal(me.data.plan, null);
  assert.equal((await c.post('/auth/logout')).status, 200);
  me = await c.get('/me');
  assert.equal(me.data.user, null);
  assert.equal((await c.get('/dashboard?today=' + TODAY)).status, 401);
  const bad = await c.post('/auth/login', { email, password: 'wrong-password' });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error, 'bad_credentials');
  const ok = await c.post('/auth/login', { email: email.toUpperCase(), password: 'longenough1' });
  assert.equal(ok.status, 200);
});

test('registration validation and duplicates', async () => {
  const c = client();
  assert.equal((await c.post('/auth/register', { email: 'nope', password: 'longenough1' })).data.error, 'bad_email');
  assert.equal((await c.post('/auth/register', { email: 'a@b.co', password: 'short' })).data.error, 'bad_password');
  const { email } = await newUser();
  const dup = await client().post('/auth/register', { email, password: 'longenough1' });
  assert.equal(dup.status, 409);
});

test('state-changing requests need the X-Glidepath header', async () => {
  const res = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@y.co', password: 'longenough1' }),
  });
  assert.equal(res.status, 403);
});

test('session cookie is HttpOnly and SameSite=Lax', async () => {
  const res = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-glidepath': '1' },
    body: JSON.stringify({ email: `c${Date.now()}@example.com`, password: 'longenough1' }),
  });
  const set = res.headers.get('set-cookie');
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);
});

// ------------------------------------------------------------- planning

test('evaluate rejects bad fields and names them', async () => {
  const { c } = await newUser();
  const r = await c.post('/profile/evaluate', { profile: profile({ heightCm: 40, activity: 'couch' }), today: TODAY });
  assert.equal(r.status, 400);
  assert.deepEqual(r.data.fields.sort(), ['activity', 'heightCm']);
});

test('server re-checks the option: an unsafe "requested" pace cannot be forced', async () => {
  const { c } = await newUser();
  const ev = await c.post('/profile/evaluate', { profile: profile({ goalKg: 75, targetDate: addDays(TODAY, 30) }), today: TODAY });
  assert.equal(ev.data.evaluation.feasible, false);
  const r = await c.post('/plan', { optionId: 'requested', today: TODAY });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'bad_option');
});

test('blocked and caution screening are enforced on the server', async () => {
  const minor = await newUser();
  const ev = await minor.c.post('/profile/evaluate', { profile: profile({ age: 16 }), today: TODAY });
  assert.equal(ev.data.screening.status, 'blocked');
  assert.equal(ev.data.evaluation, null);
  const r = await minor.c.post('/plan', { optionId: 'steady', today: TODAY });
  assert.equal(r.status, 403);
  assert.deepEqual(r.data.blocked, ['minor']);

  const meds = await newUser();
  const ev2 = await meds.c.post('/profile/evaluate', { profile: profile({ screening: { diabetesMeds: true } }), today: TODAY });
  const opt = ev2.data.evaluation.recommended;
  assert.equal((await meds.c.post('/plan', { optionId: opt, today: TODAY })).data.error, 'needs_ack');
  assert.equal((await meds.c.post('/plan', { optionId: opt, today: TODAY, ack: true })).status, 201);
});

test('a new plan has targets, a training week and today\'s weight', async () => {
  const { c, plan } = await userWithPlan();
  assert.ok(plan.targets.calories >= plan.targets.floor);
  assert.deepEqual(Object.keys(plan.training.week), ['0', '2', '4']);
  const w = await c.get('/weights');
  assert.equal(w.data.weights[0].kg, 88);
  assert.equal(w.data.weights[0].date, TODAY);
});

// ----------------------------------------------------------------- food

test('food: server computes calories, ignores client numbers', async () => {
  const { c } = await userWithPlan();
  const r = await c.post('/food', { date: TODAY, meal: 'lunch', items: [{ foodId: 'rice', grams: 200, kcal: 1, source: 'db' }] });
  assert.equal(r.status, 201);
  assert.equal(r.data.entries[0].kcal, 260);
  const fried = await c.post('/food', { date: TODAY, meal: 'lunch', items: [{ foodId: 'egg', grams: 50, cooking: 'panfried', source: 'db' }] });
  assert.ok(fried.data.entries[0].kcal > 78);
  const id = r.data.entries[0].id;
  const up = await c.patch(`/food/${id}`, { grams: 100 });
  assert.equal(up.data.entry.kcal, 130);
  const day = await c.get(`/food?date=${TODAY}`);
  assert.equal(day.data.entries.length, 2);
});

test('food: custom items are bounded; other users cannot touch your entries', async () => {
  const a = await userWithPlan();
  const b = await userWithPlan();
  const bad = await a.c.post('/food', { date: TODAY, meal: 'snack', items: [{ name: 'x', grams: 100, per100: { k: 5000 } }] });
  assert.equal(bad.data.error, 'bad_nutrition');
  const ok = await a.c.post('/food', { date: TODAY, meal: 'snack', items: [{ name: '<b>cake</b>', grams: 80, per100: { k: 350, p: 4 }, source: 'custom' }] });
  const id = ok.data.entries[0].id;
  assert.equal(ok.data.entries[0].kcal, 280);
  assert.equal((await b.c.patch(`/food/${id}`, { grams: 1 })).status, 404);
  assert.equal((await b.c.del(`/food/${id}`)).status, 404);
  assert.equal((await b.c.get(`/food?date=${TODAY}`)).data.entries.length, 0);
});

test('food: copy a meal and list recent foods', async () => {
  const { c } = await userWithPlan();
  const y = addDays(TODAY, -1);
  await c.post('/food', { date: y, meal: 'breakfast', items: [{ foodId: 'oatmeal', grams: 250 }, { foodId: 'egg', grams: 100 }] });
  const r = await c.post('/food/copy', { from: y, to: TODAY, meal: 'breakfast' });
  assert.equal(r.data.entries.length, 2);
  assert.ok(r.data.entries.every((e) => e.source === 'copy'));
  const recent = await c.get(`/food/recent?today=${TODAY}`);
  assert.equal(recent.data.items[0].times, 2);
});

test('dates in the future are rejected', async () => {
  const { c } = await userWithPlan();
  const r = await c.post('/food', { date: addDays(TODAY, 5), meal: 'lunch', items: [{ foodId: 'rice', grams: 100 }] });
  assert.equal(r.data.error, 'bad_date');
});

// ------------------------------------------------------------- recognize

const IMG = 'data:image/jpeg;base64,' + Buffer.from('fake image bytes').toString('base64');

test('recognize: calls the vision model with a strict schema and normalises the answer', async () => {
  const { c } = await userWithPlan();
  fakeOpenAI = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      is_food: true, note: '油看不出来',
      items: [
        { name_zh: '米饭', name_en: 'Rice', food_id: 'rice', grams: 180, cooking: 'plain', kcal_per_100g: 999, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 0, confidence: 0.9 },
        { name_zh: '神秘酱汁', name_en: 'Mystery sauce', food_id: 'not_a_food', grams: 99999, cooking: 'plain', kcal_per_100g: 250, protein_per_100g: 2, carbs_per_100g: 10, fat_per_100g: 22, confidence: 3 },
      ],
    }) } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const r = await c.post('/food/recognize', { image: IMG, lang: 'zh' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.demo, false);
  const [rice, sauce] = r.data.items;
  assert.equal(rice.foodId, 'rice');
  assert.equal(rice.per100.k, 130); // table value wins over the model's number
  assert.equal(sauce.foodId, null); // unknown id dropped
  assert.equal(sauce.grams, 2000); // clamped
  assert.equal(sauce.confidence, 1);
  const call = fetchCalls[fetchCalls.length - 1];
  assert.equal(call.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(call.body.model, 'gpt-4.1-mini');
  assert.equal(call.body.response_format.json_schema.strict, true);
  assert.equal(call.body.messages[1].content[1].image_url.url, IMG);
});

test('recognize: daily limit, upstream errors and bad images', async () => {
  const { c } = await userWithPlan();
  fakeOpenAI = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ is_food: false, note: '', items: [] }) } }] }), { status: 200 });
  const first = await c.post('/food/recognize', { image: IMG });
  assert.equal(first.data.isFood, false);
  fakeOpenAI = async () => new Response('{"error":"boom"}', { status: 500 });
  assert.equal((await c.post('/food/recognize', { image: IMG })).status, 502);
  fakeOpenAI = async () => new Response(JSON.stringify({ choices: [{ message: { refusal: 'no' } }] }), { status: 200 });
  assert.equal((await c.post('/food/recognize', { image: IMG })).data.isFood, false);
  const limited = await c.post('/food/recognize', { image: IMG });
  assert.equal(limited.status, 429);
  assert.equal(limited.data.error, 'daily_limit');
  assert.equal((await c.post('/food/recognize', { image: 'data:text/html;base64,AAAA' })).data.error, 'bad_image');
});

test('recognize: demo accounts get sample results without calling the model', async () => {
  const c = client();
  await c.post('/auth/demo', { today: TODAY });
  const before = fetchCalls.length;
  const r = await c.post('/food/recognize', { image: IMG, lang: 'en' });
  assert.equal(r.data.demo, true);
  assert.ok(r.data.items.length >= 2);
  assert.equal(fetchCalls.length, before);
});

test('recognize: no API key means demo results for everyone', async () => {
  const other = createApp({ dbPath: ':memory:', anthropicKey: null, openaiKey: null, log: () => {} });
  const srv = other.app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/api`;
  const h = { 'content-type': 'application/json', 'x-glidepath': '1' };
  const reg = await fetch(url + '/auth/register', { method: 'POST', headers: h, body: JSON.stringify({ email: 'k@example.com', password: 'longenough1' }) });
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const r = await fetch(url + '/food/recognize', { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ image: IMG }) });
  assert.equal((await r.json()).demo, true);
  srv.close();
  other.close();
});

// ------------------------------------------------- weights / dashboard

test('dashboard: totals, trend, recalculation and maintenance', async () => {
  const { c, plan } = await userWithPlan();
  for (let i = 1; i <= 21; i++) await c.post('/weights', { date: addDays(TODAY, -i), kg: 88 + i * 0.07 });
  await c.post('/weights', { date: TODAY, kg: 86.4 });
  await c.post('/food', { date: TODAY, meal: 'breakfast', items: [{ foodId: 'oatmeal', grams: 250 }] });
  let d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.equal(d.intake.kcal, 178);
  assert.equal(d.week.length, 7);
  assert.ok(d.weight.trend < 89 && d.weight.trend > 86);
  assert.ok(d.weight.weeklyChange < 0);
  assert.equal(d.weight.loggedToday, true);
  assert.equal(d.workout.week.planned, 3);

  await c.post('/weights', { date: TODAY, kg: 84 });
  for (let i = 1; i <= 6; i++) await c.post('/weights', { date: addDays(TODAY, -i), kg: 84.5 });
  d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.equal(d.weight.needsRecalc, true);
  const re = await c.post('/plan/recalc', { today: TODAY });
  assert.ok(re.data.plan.targets.calories <= plan.targets.calories);
  assert.ok(re.data.plan.targets.basedOnKg < 88);

  const m = await c.post('/plan/maintain', { today: TODAY });
  assert.equal(m.data.plan.phase, 'maintain');
  d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.equal(d.phase, 'maintain');
  assert.ok(d.targets.calories > re.data.plan.targets.calories);
});

test('weights and daily logs are validated', async () => {
  const { c } = await userWithPlan();
  assert.equal((await c.post('/weights', { date: TODAY, kg: 5 })).data.error, 'bad_weight');
  assert.equal((await c.post('/daily', { date: TODAY, steps: -3 })).data.error, 'bad_steps');
  const ok = await c.post('/daily', { date: TODAY, steps: 9000 });
  assert.equal(ok.data.daily.steps, 9000);
  const more = await c.post('/daily', { date: TODAY, sleepHours: 7.5 });
  assert.deepEqual(more.data.daily, { steps: 9000, sleepHours: 7.5, sleepQuality: null, waterMl: null });
  assert.equal((await c.post('/daily', { date: TODAY, sleepQuality: 4 })).data.error, 'bad_sleep_quality');
  assert.equal((await c.post('/daily', { date: TODAY, waterMl: -250 })).data.error, 'bad_water');
  assert.equal((await c.post('/daily', { date: TODAY, waterMl: 9000 })).data.error, 'bad_water');
  const water = await c.post('/daily', { date: TODAY, sleepQuality: 1, waterMl: 750 });
  assert.deepEqual(water.data.daily, { steps: 9000, sleepHours: 7.5, sleepQuality: 1, waterMl: 750 });
  // 0 glasses is a real value, not "unchanged"
  assert.equal((await c.post('/daily', { date: TODAY, waterMl: 0 })).data.daily.waterMl, 0);
});

// ------------------------------------------------------- optional tracking

test('tracking: everything is off by default and switches on one at a time', async () => {
  const { c } = await userWithPlan();
  const me = (await c.get('/me')).data.user;
  assert.deepEqual(me.tracking, { waist: false, cycle: false, sleepQuality: false, water: false, cycleKind: 'natural', introDismissed: false });
  let d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.equal(d.body.waist, null);
  assert.equal(d.body.cycle, null);
  assert.equal(d.body.water, null);
  assert.deepEqual(d.body.bands, []);

  const r = await c.post('/tracking', { waist: true, water: true, extra: 'ignored' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.tracking.waist, true);
  assert.equal(r.data.user.tracking.cycle, false);
  assert.equal((await c.post('/tracking', { cycle: 'yes' })).data.error, 'bad_tracking');
  assert.equal((await c.post('/tracking', { cycleKind: 'other' })).data.error, 'bad_tracking');
  d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.equal(d.body.waist.due, true);
  assert.deepEqual(d.body.water, { cups: 8, ml: 2000 });
  assert.equal((await c.get('/me')).data.user.tracking.water, true);
});

test('waist: logged on its own, validated, and a shrinking waist overrides a plateau', async () => {
  const { c } = await userWithPlan();
  await c.post('/tracking', { waist: true });
  assert.equal((await c.post('/waist', { date: TODAY, cm: 20 })).data.error, 'bad_waist');
  // the plan started four weeks ago, and the scale has been flat for three of them...
  const uid = (await c.get('/me')).data.user.id;
  appCtx.db.prepare("UPDATE plans SET data = json_set(data, '$.createdAt', ?) WHERE user_id = ?").run(addDays(TODAY, -28), uid);
  for (let i = 0; i <= 24; i++) await c.post('/weights', { date: addDays(TODAY, -i), kg: 88 });
  let d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.equal(d.weight.plateau, true);
  assert.equal(d.weight.waistDown, null);
  // ...but the waist went from 96 to 94.5 cm
  await c.post('/waist', { date: addDays(TODAY, -21), cm: 96 });
  const r = await c.post('/waist', { date: TODAY, cm: 94.5 });
  assert.equal(r.status, 201);
  assert.equal(r.data.waists.length, 2);
  d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.equal(d.weight.plateau, false);
  assert.deepEqual(d.weight.waistDown, { cm: 1.5, weeks: 3 });
  assert.equal(d.body.waist.latest.cm, 94.5);
  assert.equal(d.body.waist.ratio, 0.53);
  assert.equal(d.body.waist.due, false);
  // with waist tracking off, it's a plain plateau again
  await c.post('/tracking', { waist: false });
  assert.equal((await c.get(`/dashboard?today=${TODAY}`)).data.weight.plateau, true);
  assert.equal((await c.del(`/waist/${TODAY}`)).status, 200);
  assert.equal((await c.get(`/body?today=${TODAY}`)).data.waists.length, 1);
});

test('cycle: log start and end, refuse overlaps, and read weight through the premenstrual week', async () => {
  const { c, plan } = await userWithPlan({ sex: 'female', heightCm: 165, weightKg: 72, goalKg: 64 });
  await c.post('/tracking', { cycle: true });
  const start1 = addDays(TODAY, -54);
  const start2 = addDays(TODAY, -26);
  assert.equal((await c.post('/periods', { today: TODAY, start: start1, end: addDays(start1, 4) })).status, 201);
  assert.equal((await c.post('/periods', { today: TODAY, start: start2 })).status, 201);
  assert.equal((await c.post('/periods', { today: TODAY, start: addDays(start2, 2) })).data.error, 'period_overlap');
  assert.equal((await c.post('/periods', { today: TODAY, start: start2, end: addDays(start2, 20) })).data.error, 'period_end');
  const ended = await c.post('/periods', { today: TODAY, start: start2, end: addDays(start2, 5) });
  assert.deepEqual(ended.data.periods.map((p) => ({ ...p })), [
    { start: start1, end: addDays(start1, 4) }, { start: start2, end: addDays(start2, 5) },
  ]);

  // a 28-day cycle: the next period is due in 2 days, so today is in the water-retention window
  for (let i = 1; i <= 10; i++) await c.post('/weights', { date: addDays(TODAY, -i), kg: 72 });
  for (let i = 0; i <= 3; i++) await c.post('/weights', { date: addDays(TODAY, -i), kg: 74.5 });
  let d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.equal(d.body.cycle.phase, 'luteal');
  assert.equal(d.body.cycle.daysToNext, 2);
  assert.equal(d.weight.cycleWater, true);
  assert.ok(d.weight.trend - plan.targets.basedOnKg >= 1, `trend ${d.weight.trend}`);
  assert.equal(d.weight.needsRecalc, false, 'no target change for premenstrual water');
  assert.equal(d.body.bands.length, 2);

  // the same weights outside the window do prompt an update
  await c.post('/tracking', { cycleKind: 'hormonal' });
  d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.equal(d.body.cycle.predicted, false);
  assert.equal(d.weight.cycleWater, false);
  assert.equal(d.weight.needsRecalc, true);

  assert.equal((await c.del(`/periods/${start1}`)).status, 200);
  assert.equal((await c.get(`/body?today=${TODAY}`)).data.periods.length, 1);
  assert.equal((await c.del('/periods')).status, 200);
  assert.equal((await c.get(`/body?today=${TODAY}`)).data.periods.length, 0);
});

test('cycle: no period for three months raises a gentle flag; poor sleep is noticed', async () => {
  const { c } = await userWithPlan({ sex: 'female', heightCm: 165, weightKg: 72, goalKg: 64 });
  await c.post('/tracking', { cycle: true, sleepQuality: true });
  await c.post('/periods', { today: TODAY, start: addDays(TODAY, -95), end: addDays(TODAY, -91) });
  await c.post('/daily', { date: TODAY, sleepHours: 5 });
  await c.post('/daily', { date: addDays(TODAY, -1), sleepHours: 7.5, sleepQuality: 1 });
  const d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.equal(d.body.cycle.missed, true);
  assert.equal(d.body.poorSleep, true);
  const b = (await c.get(`/body?today=${TODAY}`)).data;
  assert.equal(b.daily.length, 2);
  assert.equal(b.sleepTarget.hours, 8);
  assert.deepEqual(b.water, { cups: 7, ml: 1750 });
});

// --------------------------------------------------------------- training

test('workout: log, progression, duplicate, undo', async () => {
  const { c } = await userWithPlan();
  const wd = 0; // do Monday's session today, whatever today is
  const w = await c.get(`/workout?date=${TODAY}&weekday=${wd}`);
  const day = w.data.day;
  assert.ok(day.slots.length >= 3);
  const squat = day.slots.find((s) => s.slot === 'squat');
  assert.equal(squat.exerciseId, 'goblet_squat');
  const sets = day.slots.flatMap((s) => Array.from({ length: s.sets }, () => (
    s.secs ? { slot: s.slot, secs: s.secs } : s.minutes ? { slot: s.slot, minutes: s.minutes } : { slot: s.slot, reps: s.reps, weight: 10 }
  )));
  const r = await c.post('/workout', { date: TODAY, sets, weekday: wd });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const ch = r.data.workout.changes.find((x) => x.slot === 'squat');
  assert.equal(ch.change, 'reps');
  assert.equal(ch.next.weight, 10);
  assert.equal((await c.post('/workout', { date: TODAY, sets, weekday: wd })).status, 409);
  const after = await c.get(`/workout?date=${TODAY}&weekday=${wd}`);
  assert.equal(after.data.day.slots.find((s) => s.slot === 'squat').reps, squat.reps + 1);
  assert.equal((await c.del(`/workout/${TODAY}`)).status, 200);
  const undone = await c.get(`/workout?date=${TODAY}&weekday=${wd}`);
  assert.equal(undone.data.day.slots.find((s) => s.slot === 'squat').reps, squat.reps);
  assert.equal(undone.data.log, null);
});

test('workout: rest days and bad sets are refused', async () => {
  const { c } = await userWithPlan({ trainDays: [0] });
  const rest = await c.post('/workout', { date: TODAY, sets: [{ slot: 'squat', reps: 10 }], weekday: 3 });
  assert.equal(rest.data.error, 'rest_day');
  const bad = await c.post('/workout', { date: TODAY, sets: [{ slot: 'nope', reps: 10 }], weekday: 0 });
  assert.equal(bad.data.error, 'bad_slot');
});

// ---------------------------------------------------------------- account

test('export contains everything; delete needs the password and removes it all', async () => {
  const { c } = await userWithPlan();
  await c.post('/food', { date: TODAY, meal: 'lunch', items: [{ foodId: 'rice', grams: 150 }] });
  await c.post('/waist', { date: TODAY, cm: 92 });
  await c.post('/periods', { today: TODAY, start: addDays(TODAY, -3) });
  const ex = await c.get('/export');
  assert.equal(ex.data.food.length, 1);
  assert.equal(ex.data.weights.length, 1);
  assert.equal(ex.data.waists.length, 1);
  assert.equal(ex.data.periods.length, 1);
  assert.equal(ex.data.account.tracking.waist, false);
  assert.ok(ex.data.plan.targets);
  assert.equal((await c.del('/account', { password: 'nope' })).status, 401);
  assert.equal((await c.del('/account', { password: 'longenough1' })).status, 200);
  assert.equal((await c.get('/me')).data.user, null);
  for (const table of ['food_entries', 'waists', 'periods', 'daily_logs']) {
    const left = appCtx.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id NOT IN (SELECT id FROM users)`).get().n;
    assert.equal(left, 0, table);
  }
});

test('demo account: four weeks of data, hidden email, purged after a day', async () => {
  const c = client();
  const r = await c.post('/auth/demo', { today: TODAY, lang: 'zh' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.isDemo, true);
  assert.equal(r.data.user.email, null);
  const d = (await c.get(`/dashboard?today=${TODAY}`)).data;
  assert.ok(d.weekAvg.days >= 6);
  assert.ok((await c.get('/weights')).data.weights.length >= 15);
  assert.ok((await c.get('/workouts')).data.workouts.length >= 6);
  assert.equal(r.data.user.tracking.cycle, true);
  assert.equal(d.body.cycle.phase, 'luteal');
  assert.equal(d.weight.cycleWater, true);
  assert.ok(d.body.waist.latest);
  assert.ok((await c.get(`/body?today=${TODAY}`)).data.periods.length === 2);
  appCtx.db.prepare('UPDATE users SET created_at = 0 WHERE is_demo = 1').run();
  const { purgeDemoUsers } = await import('../../server/demo.js');
  assert.ok(purgeDemoUsers(appCtx.db) >= 1);
  assert.equal((await c.get('/me')).data.user, null);
});

test('static files carry security headers', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('pose detection: MediaPipe files are served, CSP allows WebAssembly and the model host', async () => {
  const bundle = await fetch(base + '/vendor/mediapipe/vision_bundle.mjs');
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get('content-type'), /javascript/);
  const wasm = await fetch(base + '/vendor/mediapipe/wasm/vision_wasm_internal.wasm', { method: 'HEAD' });
  assert.equal(wasm.status, 200);
  const csp = (await fetch(base + '/')).headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(csp, /connect-src 'self' https:\/\/storage\.googleapis\.com/);
  const { c } = await newUser();
  const me = await c.get('/me');
  assert.match(me.data.config.poseModelUrl, /^https:\/\/storage\.googleapis\.com\/.*pose_landmarker_lite\.task$/);
});

test('pose detection: POSE_MODEL_FILE is served locally and the CSP stays same-origin', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gp-')), 'model.task');
  fs.writeFileSync(file, 'not really a model');
  const local = createApp({ dbPath: ':memory:', anthropicKey: null, openaiKey: null, poseModelFile: file, log: () => {} });
  const srv = local.app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}`;
  const res = await fetch(url + '/vendor/pose_landmarker.task');
  assert.equal(await res.text(), 'not really a model');
  assert.match(res.headers.get('content-security-policy'), /connect-src 'self';/);
  srv.close();
  local.close();
});

// ------------------------------------------------------------ Claude vision

test('recognize with Claude: image block, structured output, normalised answer', async () => {
  const calls = [];
  let reply;
  const claude = createApp({
    dbPath: ':memory:', anthropicKey: 'sk-ant-test', openaiKey: 'sk-also-set', authLimit: 1000, log: () => {},
    fetchImpl: async (url, init) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return reply(); },
  });
  const srv = claude.app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/api`;
  const h = { 'content-type': 'application/json', 'x-glidepath': '1' };
  const reg = await fetch(url + '/auth/register', { method: 'POST', headers: h, body: JSON.stringify({ email: 'claude@example.com', password: 'longenough1' }) });
  const H = { ...h, cookie: reg.headers.get('set-cookie').split(';')[0] };
  const me = await (await fetch(url + '/me', { headers: H })).json();
  assert.deepEqual(me.ai, { enabled: true, provider: 'anthropic', demo: false });

  reply = () => new Response(JSON.stringify({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({
      is_food: true, note: '面衣吸油，热量可能更高',
      items: [{ name_zh: '炸鸡', name_en: 'Fried chicken', food_id: 'fried_chicken', grams: 240, cooking: 'plain',
        kcal_per_100g: 1, protein_per_100g: 1, carbs_per_100g: 1, fat_per_100g: 1, confidence: 0.85 }],
    }) }],
  }), { status: 200 });
  const r = await (await fetch(url + '/food/recognize', { method: 'POST', headers: H, body: JSON.stringify({ image: IMG, lang: 'zh' }) })).json();
  assert.equal(r.demo, false);
  assert.equal(r.items[0].foodId, 'fried_chicken');
  assert.equal(r.items[0].per100.k, 275); // our table, not the model's number
  assert.equal(r.note, '面衣吸油，热量可能更高');

  const call = calls[0];
  assert.equal(call.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(call.headers.authorization, 'Bearer sk-ant-test');
  assert.equal(call.headers['anthropic-workspace-id'], undefined);
  assert.equal(call.headers['anthropic-version'], '2023-06-01');
  assert.equal(call.body.model, 'claude-haiku-5-5');
  assert.equal(call.body.output_config.format.type, 'json_schema');
  assert.equal(call.body.output_config.format.schema.additionalProperties, false);
  assert.equal(call.body.output_config.effort, undefined);
  const [img, txt] = call.body.messages[0].content;
  assert.deepEqual(img, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMG.split(',')[1] } });
  assert.equal(txt.type, 'text');
  assert.match(call.body.system, /fried_chicken: 炸鸡/);

  reply = () => new Response(JSON.stringify({ stop_reason: 'refusal', content: [] }), { status: 200 });
  assert.equal((await (await fetch(url + '/food/recognize', { method: 'POST', headers: H, body: JSON.stringify({ image: IMG }) })).json()).isFood, false);
  // errors come back with a code the page can explain
  const errorFor = async (status, error) => {
    reply = () => new Response(JSON.stringify({ type: 'error', error }), { status });
    const res = await fetch(url + '/food/recognize', { method: 'POST', headers: H, body: JSON.stringify({ image: IMG }) });
    assert.equal(res.status, 502);
    return (await res.json()).error;
  };
  assert.equal(await errorFor(529, { type: 'overloaded_error', message: 'Overloaded' }), 'ai_busy');
  assert.equal(await errorFor(401, { type: 'authentication_error', message: 'invalid x-api-key' }), 'ai_auth');
  assert.equal(await errorFor(400, { type: 'invalid_request_error',
    message: 'anthropic-workspace-id is required when authenticating with an identity-linked API key; send the id of the workspace this request acts in.' }), 'ai_workspace');
  assert.equal(await errorFor(400, { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' }), 'ai_billing');
  assert.equal(await errorFor(404, { type: 'not_found_error', message: 'model: claude-nope' }), 'ai_model');
  srv.close();
  claude.close();
});

test('recognize with Claude: ANTHROPIC_WORKSPACE_ID is sent as anthropic-workspace-id', async () => {
  const calls = [];
  const claude = createApp({
    dbPath: ':memory:', anthropicKey: 'sk-ant-usr-test', anthropicWorkspaceId: 'wrkspc_test123', openaiKey: null, log: () => {},
    fetchImpl: async (u, init) => {
      calls.push(init.headers);
      return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"is_food":false,"note":"","items":[]}' }] }), { status: 200 });
    },
  });
  const srv = claude.app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/api`;
  const h = { 'content-type': 'application/json', 'x-glidepath': '1' };
  const reg = await fetch(url + '/auth/register', { method: 'POST', headers: h, body: JSON.stringify({ email: 'ws@example.com', password: 'longenough1' }) });
  const H = { ...h, cookie: reg.headers.get('set-cookie').split(';')[0] };
  const r = await (await fetch(url + '/food/recognize', { method: 'POST', headers: H, body: JSON.stringify({ image: IMG }) })).json();
  assert.equal(r.isFood, false);
  assert.equal(calls[0]['anthropic-workspace-id'], 'wrkspc_test123');
  srv.close();
  claude.close();
});
