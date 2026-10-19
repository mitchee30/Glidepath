import express from 'express';
import {
  hashPassword, verifyPassword, createSession, deleteSession, userForToken, readCookie,
  setSessionCookie, clearSessionCookie, rateLimiter, COOKIE,
} from './auth.js';
import * as store from './store.js';
import { HttpError } from './store.js';
import { createDemoUser } from './demo.js';
import { recognize, demoRecognition } from './ai.js';
import { evaluateGoal, screen, validateProfile, buildTargets, maintenanceTargets, projectEnd } from '../public/js/core/plan.js';
import { movingAverage, trendWeight, weeklyChange, isPlateau, safetySignals } from '../public/js/core/trend.js';
import { weeklyAverage, MEALS } from '../public/js/core/nutrition.js';
import { resolveDay } from '../public/js/core/training.js';
import { addDays, daysBetween, isISODate, weekday } from '../public/js/core/dates.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const INJURIES = ['knee', 'back', 'shoulder', 'wrist'];
const DIETS = ['none', 'vegetarian', 'vegan'];
const UNITS = ['metric', 'jin', 'imperial'];

export function createApi(db, opts) {
  const api = express.Router();
  const authLimit = rateLimiter({ windowMs: 10 * 60 * 1000, max: opts.authLimit ?? 20 });
  const demoLimit = rateLimiter({ windowMs: 60 * 60 * 1000, max: opts.demoLimit ?? 10 });
  const small = express.json({ limit: '100kb' });
  const big = express.json({ limit: '8mb' });

  api.use((req, res, next) => (req.path === '/food/recognize' ? big : small)(req, res, next));

  // Cross-site requests cannot add custom headers without a CORS preflight, which we never allow.
  api.use((req, res, next) => {
    if (req.method !== 'GET' && req.get('x-glidepath') !== '1') return res.status(403).json({ error: 'csrf' });
    next();
  });

  // ------------------------------------------------------------- helpers
  const wrap = (fn) => (req, res, next) => {
    try {
      const out = fn(req, res);
      if (out && typeof out.then === 'function') out.catch(next);
    } catch (e) {
      next(e);
    }
  };

  const auth = (req, res, next) => {
    const user = userForToken(db, readCookie(req, COOKIE));
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    next();
  };

  const serverToday = () => new Date().toISOString().slice(0, 10);
  const date = (v, name = 'date') => {
    if (!isISODate(v) || v < '2000-01-01' || v > addDays(serverToday(), 1)) throw new HttpError(400, `bad_${name}`);
    return v;
  };
  const publicUser = (u) => ({ id: u.id, email: u.is_demo ? null : u.email, isDemo: !!u.is_demo, lang: u.lang, units: u.units });

  function cleanProfile(b) {
    const p = {
      sex: b.sex,
      age: Math.round(Number(b.age)),
      heightCm: Number(b.heightCm),
      weightKg: Math.round(Number(b.weightKg) * 10) / 10,
      goalKg: Math.round(Number(b.goalKg) * 10) / 10,
      targetDate: b.targetDate,
      activity: b.activity,
      experience: b.experience,
      equipment: b.equipment,
      trainDays: Array.isArray(b.trainDays) ? [...new Set(b.trainDays.map(Number))].sort((a, c) => a - c) : [],
      sessionMin: Number(b.sessionMin),
      injuries: Array.isArray(b.injuries) ? b.injuries.filter((x) => INJURIES.includes(x)) : [],
      diet: DIETS.includes(b.diet) ? b.diet : 'none',
      allergies: String(b.allergies || '').slice(0, 200),
      bedtime: b.bedtime,
      wake: b.wake,
      screening: {
        pregnant: !!b.screening?.pregnant,
        eatingDisorder: !!b.screening?.eatingDisorder,
        diabetesMeds: !!b.screening?.diabetesMeds,
        otherCondition: !!b.screening?.otherCondition,
      },
      fitnessTest: null,
    };
    const t = b.fitnessTest;
    if (t && typeof t === 'object') {
      const n = (v, hi) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Math.min(hi, Math.max(0, Math.round(Number(v)))) : null);
      p.fitnessTest = { pushups: n(t.pushups, 200), squats: n(t.squats, 300), plankSec: n(t.plankSec, 900) };
    }
    return p;
  }

  // ---------------------------------------------------------------- auth
  api.post('/auth/register', wrap((req, res) => {
    if (!authLimit(req.ip)) throw new HttpError(429, 'rate_limited');
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'bad_email');
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'bad_password');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'email_taken');
    const lang = req.body.lang === 'en' ? 'en' : 'zh';
    const units = UNITS.includes(req.body.units) ? req.body.units : 'metric';
    const id = db.prepare('INSERT INTO users (email, pass, lang, units, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(email, hashPassword(password), lang, units, Date.now()).lastInsertRowid;
    setSessionCookie(req, res, createSession(db, id));
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  }));

  api.post('/auth/login', wrap((req, res) => {
    if (!authLimit(req.ip)) throw new HttpError(429, 'rate_limited');
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_demo = 0').get(email);
    // run scrypt even for unknown emails so timing does not reveal which accounts exist
    const ok = verifyPassword(String(req.body.password || ''), user?.pass || 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
    if (!user || !ok) throw new HttpError(401, 'bad_credentials');
    setSessionCookie(req, res, createSession(db, user.id));
    res.json({ user: publicUser(user) });
  }));

  api.post('/auth/demo', wrap((req, res) => {
    if (!demoLimit(req.ip)) throw new HttpError(429, 'rate_limited');
    const today = date(req.body.today, 'today');
    const { id } = createDemoUser(db, today, req.body.lang);
    setSessionCookie(req, res, createSession(db, id));
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  }));

  api.post('/auth/logout', wrap((req, res) => {
    deleteSession(db, readCookie(req, COOKIE));
    clearSessionCookie(res);
    res.json({ ok: true });
  }));

  api.get('/me', wrap((req, res) => {
    // answers 200 with user: null when logged out, so the first page load has no error noise
    req.user = userForToken(db, readCookie(req, COOKIE));
    if (!req.user) return res.json({ user: null, profile: null, plan: null, ai: null });
    res.json({
      user: publicUser(req.user),
      profile: store.getProfile(db, req.user.id),
      plan: store.getPlan(db, req.user.id),
      ai: { enabled: !!opts.ai, provider: opts.ai?.provider ?? null, demo: !opts.ai || (!!req.user.is_demo && !opts.demoUsesAi) },
      config: { poseModelUrl: opts.poseModelUrl },
    });
  }));

  api.post('/settings', auth, wrap((req, res) => {
    const lang = req.body.lang === undefined ? req.user.lang : req.body.lang === 'en' ? 'en' : 'zh';
    const units = UNITS.includes(req.body.units) ? req.body.units : req.user.units;
    db.prepare('UPDATE users SET lang = ?, units = ? WHERE id = ?').run(lang, units, req.user.id);
    res.json({ user: publicUser({ ...req.user, lang, units }) });
  }));

  // -------------------------------------------------------- profile/plan
  api.post('/profile/evaluate', auth, wrap((req, res) => {
    const today = date(req.body.today, 'today');
    const profile = cleanProfile(req.body.profile || {});
    const bad = validateProfile(profile);
    if (bad.length) throw new HttpError(400, 'bad_profile', { fields: bad });
    store.saveProfile(db, req.user.id, profile);
    const screening = screen(profile);
    const evaluation = screening.status === 'blocked' ? null : evaluateGoal(profile, today);
    res.json({ profile, screening, evaluation });
  }));

  api.post('/plan', auth, wrap((req, res) => {
    const today = date(req.body.today, 'today');
    const profile = store.getProfile(db, req.user.id);
    if (!profile) throw new HttpError(400, 'no_profile');
    const plan = store.createPlan(db, req.user.id, profile, String(req.body.optionId || ''), today, { ack: !!req.body.ack });
    res.status(201).json({ plan });
  }));

  api.post('/plan/recalc', auth, wrap((req, res) => {
    const today = date(req.body.today, 'today');
    const profile = store.getProfile(db, req.user.id);
    const plan = store.getPlan(db, req.user.id);
    if (!plan || !profile) throw new HttpError(400, 'no_plan');
    const trend = trendWeight(store.getWeights(db, req.user.id)) ?? profile.weightKg;
    if (plan.phase === 'loss') plan.targets = buildTargets(profile, plan.option, trend);
    plan.updatedAt = today;
    store.savePlan(db, req.user.id, plan);
    res.json({ plan });
  }));

  api.post('/plan/maintain', auth, wrap((req, res) => {
    const today = date(req.body.today, 'today');
    const plan = store.getPlan(db, req.user.id);
    if (!plan) throw new HttpError(400, 'no_plan');
    if (plan.phase !== 'maintain') {
      plan.phase = 'maintain';
      plan.maintainSince = today;
      plan.targets.lossCalories = plan.targets.calories;
      plan.updatedAt = today;
      store.savePlan(db, req.user.id, plan);
    }
    res.json({ plan });
  }));

  // ------------------------------------------------------------ dashboard
  api.get('/dashboard', auth, wrap((req, res) => {
    const uid = req.user.id;
    const today = date(req.query.today, 'today');
    const profile = store.getProfile(db, uid);
    const plan = store.getPlan(db, uid);
    if (!plan || !profile) return res.json({ needsOnboarding: true });

    const weights = store.getWeights(db, uid);
    const trend = trendWeight(weights);
    let targets = plan.targets;
    if (plan.phase === 'maintain') {
      targets = maintenanceTargets(profile, plan.targets, trend ?? profile.weightKg, daysBetween(plan.maintainSince, today));
    }
    const week = store.dayTotals(db, uid, addDays(today, -6), today);
    const past = store.dayTotals(db, uid, addDays(today, -7), addDays(today, -1));
    const avg = weeklyAverage(past);
    const signals = safetySignals({
      today, dayTotals: past.slice(-3), floor: targets.floor, weights, planStart: plan.createdAt,
    });
    const sincePlan = weights.filter((w) => w.date >= plan.createdAt);
    const day = resolveDay(plan.training, weekday(today), store.getState(db, uid));
    res.json({
      today,
      phase: plan.phase,
      targets,
      plan: { createdAt: plan.createdAt, startKg: plan.startKg, goalKg: plan.targets.goalKg, optionId: plan.option.id, endDate: plan.option.endDate },
      intake: week[week.length - 1],
      week,
      weekAvg: avg && { ...avg, deficit: Math.round(targets.tdee - avg.kcal) },
      weight: {
        trend,
        latest: weights[weights.length - 1] || null,
        weeklyChange: weeklyChange(weights, 14),
        projectedEnd: plan.phase === 'loss' ? projectEnd(profile, plan.targets, trend ?? profile.weightKg, today) : null,
        plateau: plan.phase === 'loss' && isPlateau(sincePlan),
        reachedGoal: plan.phase === 'loss' && trend !== null && trend <= plan.targets.goalKg + 0.2,
        needsRecalc: plan.phase === 'loss' && trend !== null && Math.abs(trend - plan.targets.basedOnKg) >= 1,
        loggedToday: weights.some((w) => w.date === today),
      },
      signals,
      workout: { day, log: store.getWorkout(db, uid, today), week: store.weekTraining(db, uid, plan, today) },
      daily: store.getDaily(db, uid, today),
      dailyWeek: store.dailyRange(db, uid, addDays(today, -6), today),
      diet: profile.diet,
    });
  }));

  // ----------------------------------------------------------------- food
  api.get('/food', auth, wrap((req, res) => {
    const d = date(req.query.date);
    res.json({ date: d, entries: store.foodForDate(db, req.user.id, d) });
  }));

  api.post('/food', auth, wrap((req, res) => {
    const d = date(req.body.date);
    const meal = req.body.meal;
    if (!MEALS.includes(meal)) throw new HttpError(400, 'bad_meal');
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length || items.length > 20) throw new HttpError(400, 'bad_items');
    const tx = db.transaction(() => items.map((it) => store.addFood(db, req.user.id, d, meal, it)));
    res.status(201).json({ entries: tx() });
  }));

  api.patch('/food/:id', auth, wrap((req, res) => {
    const changes = {};
    if (req.body.grams !== undefined) changes.grams = Number(req.body.grams);
    if (req.body.meal !== undefined) changes.meal = req.body.meal;
    if (req.body.cooking !== undefined) changes.cooking = req.body.cooking;
    res.json({ entry: store.updateFood(db, req.user.id, Number(req.params.id), changes) });
  }));

  api.delete('/food/:id', auth, wrap((req, res) => {
    store.deleteFood(db, req.user.id, Number(req.params.id));
    res.json({ ok: true });
  }));

  api.post('/food/copy', auth, wrap((req, res) => {
    const from = date(req.body.from, 'from');
    const to = date(req.body.to, 'to');
    if (!MEALS.includes(req.body.meal)) throw new HttpError(400, 'bad_meal');
    res.status(201).json({ entries: store.copyMeal(db, req.user.id, from, to, req.body.meal) });
  }));

  api.get('/food/recent', auth, wrap((req, res) => {
    res.json({ items: store.recentFoods(db, req.user.id, date(req.query.today, 'today')) });
  }));

  api.post('/food/recognize', auth, wrap(async (req, res) => {
    const image = String(req.body.image || '');
    const lang = req.body.lang === 'en' ? 'en' : 'zh';
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 7_000_000) {
      throw new HttpError(400, 'bad_image');
    }
    const useAi = !!opts.ai && (!req.user.is_demo || opts.demoUsesAi);
    if (!useAi) return res.json(demoRecognition(image, lang));

    const day = serverToday();
    const used = db.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND day = ?').get(req.user.id, day)?.count ?? 0;
    if (used >= opts.recognizeDailyLimit) throw new HttpError(429, 'daily_limit', { limit: opts.recognizeDailyLimit });
    db.prepare(`INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1)
                ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`).run(req.user.id, day);
    try {
      const result = await recognize(opts.ai, { image, lang, fetchImpl: opts.fetchImpl });
      res.json({ ...result, demo: false });
    } catch (e) {
      opts.log?.(`[recognize] ${e.message}`);
      throw new HttpError(502, 'ai_failed');
    }
  }));

  // -------------------------------------------------------------- weights
  api.get('/weights', auth, wrap((req, res) => {
    const weights = store.getWeights(db, req.user.id);
    const waist = new Map(weights.map((w) => [w.date, w.waistCm]));
    res.json({ weights: movingAverage(weights).map((p) => ({ ...p, waistCm: waist.get(p.date) ?? null })) });
  }));

  api.post('/weights', auth, wrap((req, res) => {
    const d = date(req.body.date);
    const waist = req.body.waistCm === undefined || req.body.waistCm === null || req.body.waistCm === '' ? null : Number(req.body.waistCm);
    store.setWeight(db, req.user.id, d, Number(req.body.kg), waist);
    res.status(201).json({ ok: true });
  }));

  api.delete('/weights/:date', auth, wrap((req, res) => {
    store.deleteWeight(db, req.user.id, date(req.params.date));
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- daily
  api.post('/daily', auth, wrap((req, res) => {
    const d = date(req.body.date);
    const steps = req.body.steps === undefined || req.body.steps === null || req.body.steps === '' ? null : Number(req.body.steps);
    const sleepHours = req.body.sleepHours === undefined || req.body.sleepHours === null || req.body.sleepHours === '' ? null : Number(req.body.sleepHours);
    res.json({ daily: store.setDaily(db, req.user.id, d, { steps, sleepHours }) });
  }));

  // -------------------------------------------------------------- workout
  api.get('/workout', auth, wrap((req, res) => {
    const d = date(req.query.date);
    const plan = store.getPlan(db, req.user.id);
    if (!plan) throw new HttpError(400, 'no_plan');
    const wd = req.query.weekday !== undefined ? Number(req.query.weekday) : weekday(d);
    res.json({
      date: d,
      weekday: wd,
      day: resolveDay(plan.training, wd, store.getState(db, req.user.id)),
      log: store.getWorkout(db, req.user.id, d),
      week: plan.training.week,
      notes: plan.training.notes,
    });
  }));

  api.post('/workout', auth, wrap((req, res) => {
    const d = date(req.body.date);
    const wd = req.body.weekday === undefined || req.body.weekday === null ? null : Number(req.body.weekday);
    res.status(201).json({ workout: store.logWorkout(db, req.user.id, d, req.body.sets, wd) });
  }));

  api.delete('/workout/:date', auth, wrap((req, res) => {
    store.undoWorkout(db, req.user.id, date(req.params.date));
    res.json({ ok: true });
  }));

  api.get('/workouts', auth, wrap((req, res) => {
    res.json({ workouts: store.workoutHistory(db, req.user.id) });
  }));

  // -------------------------------------------------------------- account
  api.get('/export', auth, wrap((req, res) => {
    res.set('Content-Disposition', `attachment; filename="glidepath-export-${serverToday()}.json"`);
    res.json(store.exportAll(db, req.user));
  }));

  api.delete('/account', auth, wrap((req, res) => {
    if (!req.user.is_demo && !verifyPassword(String(req.body?.password || ''), req.user.pass)) {
      throw new HttpError(401, 'bad_credentials');
    }
    store.deleteUser(db, req.user.id);
    clearSessionCookie(res);
    res.json({ ok: true });
  }));

  api.use((req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, ...err.extra });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    opts.log?.(`[api] ${req.method} ${req.path}: ${err.stack || err}`);
    res.status(500).json({ error: 'server_error' });
  });

  return api;
}
