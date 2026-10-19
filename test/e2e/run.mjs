// End-to-end tests in a real browser (Playwright, phone-sized viewport).
// Run: npm run e2e            (set SHOTS=dir to also save screenshots)
// Needs a Chromium for Playwright: npx playwright install chromium

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SHOTS || null;
const MEAL = path.join(HERE, 'meal.jpg');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glidepath-e2e-'));
const { app, close } = createApp({ dbPath: path.join(tmp, 'e2e.db'), anthropicKey: null, openaiKey: null, authLimit: 1000, demoLimit: 1000, log: () => {} });
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const results = [];
let failed = 0;

async function newPage({ scheme = 'light', locale = 'zh-CN' } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, locale, timezoneId: 'America/Toronto',
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('[i18n]'))) page.errors.push(`${m.type()}: ${m.text()}`);
  });
  return page;
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function noHorizontalScroll(page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `page is ${sw}px wide in a ${iw}px viewport`);
}

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`ok   ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}\n     ${String(e.stack || e).split('\n').slice(0, 4).join('\n     ')}`);
  }
}

let n = 0;
const email = () => `e2e${Date.now()}${n++}@example.com`;

async function register(page) {
  await page.goto(`${BASE}/#/register`);
  await page.fill('input[name=email]', email());
  await page.fill('input[name=password]', 'correct horse 1');
  await page.click('button[type=submit]');
  await page.waitForSelector('.onboarding');
}

async function fillOnboarding(page, { weight = '72', goal = '62', days = 30, health = [], injuries = ['knee'], trainDays = ['0', '2', '4'] } = {}) {
  await page.check('input[name=sex][value=female]', { force: true });
  await page.fill('input[name=age]', '28');
  await page.fill('input[name=heightCm]', '165');
  await page.fill('input[name=weight]', weight);
  await page.click('button[type=submit]');
  await page.waitForSelector('input[name=goal]');
  await page.fill('input[name=goal]', goal);
  const target = await page.evaluate((d) => {
    const x = new Date(); x.setDate(x.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  }, days);
  await page.fill('input[name=targetDate]', target);
  await page.waitForSelector('[data-preview] .notice');
  await shot(page, 'ob-goal');
  await page.click('button[type=submit]');
  await page.waitForSelector('input[name=pregnant]', { state: 'attached' });
  for (const h of health) await page.check(`input[name=${h}]`, { force: true });
  await page.click('button[type=submit]');
  await page.waitForSelector('input[name=activity]', { state: 'attached' });
  await page.click('button[type=submit]');
  await page.waitForSelector('input[name=experience]', { state: 'attached' });
  for (const d of ['0', '1', '2', '3', '4', '5', '6']) {
    const box = page.locator(`input[name=trainDays][value="${d}"]`);
    if (trainDays.includes(d)) await box.check({ force: true }); else await box.uncheck({ force: true });
  }
  for (const i of injuries) await page.check(`input[name=injuries][value=${i}]`, { force: true });
  await shot(page, 'ob-training');
  await page.click('button[type=submit]');
}

// ---------------------------------------------------------------- tests

await step('welcome page renders without errors and fits a phone', async () => {
  const page = await newPage();
  await page.goto(BASE);
  await page.waitForSelector('.welcome .hero-title');
  assert.equal(await page.textContent('h1'), '各位乘客，本次航班目的地：目标体重');
  await noHorizontalScroll(page);
  await page.waitForTimeout(1800);
  await shot(page, 'welcome');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

let mainPage;
await step('register + onboarding: 10 kg in 30 days is replaced by safe options', async () => {
  const page = await newPage();
  mainPage = page;
  await register(page);
  await fillOnboarding(page);
  await page.waitForSelector('.options');
  const title = await page.textContent('h1');
  assert.equal(title, '换一个更稳妥的节奏');
  const warn = await page.textContent('.notice-warn');
  assert.match(warn, /每周要减/);
  assert.match(warn, /安全上限/);
  const ids = await page.$$eval('input[name=option]', (els) => els.map((e) => e.value));
  assert.ok(!ids.includes('requested'), ids.join());
  assert.ok(ids.includes('steady') && ids.includes('milestone'), ids.join());
  assert.equal(await page.$eval('input[name=option]:checked', (e) => e.value), 'steady');
  await noHorizontalScroll(page);
  await shot(page, 'ob-result');
  await page.click('button[type=submit]');
  await page.waitForSelector('.summary-grid');
  await shot(page, 'ob-summary');
  const kcal = Number((await page.textContent('.summary-grid > div:first-child b')).replace(/\D/g, ''));
  assert.ok(kcal >= 1450 && kcal < 2000, `daily calories ${kcal}`);
  assert.match(await page.textContent('.page'), /膝盖|伤病/);
  await page.click('a[href="#/today"]');
  await page.waitForSelector('.budget');
  assert.deepEqual(page.errors, []);
});

await step('today: budget, ruler and week chart render', async () => {
  const page = mainPage;
  assert.match(await page.textContent('.budget-label'), /今天还能吃/);
  assert.ok(await page.$('.ruler-track'));
  assert.ok(await page.$('[data-week] svg'));
  await noHorizontalScroll(page);
  await shot(page, 'today-new');
});

await step('photo logging (demo mode): recognise, edit grams, save', async () => {
  const page = mainPage;
  await page.click('[data-photo]');
  await page.waitForSelector('dialog.sheet .photo-pick');
  await shot(page, 'photo-pick');
  await page.setInputFiles('dialog.sheet input[data-file]:not([capture])', MEAL);
  await page.waitForSelector('dialog.sheet .pitems');
  assert.ok(await page.$('dialog.sheet .tag-demo'), 'demo tag shown');
  const before = await page.textContent('[data-total] b');
  const first = page.locator('dialog.sheet [data-grams="0"]');
  const grams = Number(await first.inputValue());
  await page.click('dialog.sheet .pitem[data-i="0"] [data-step="10"]');
  assert.equal(Number(await first.inputValue()), grams + 10);
  const after = await page.textContent('[data-total] b');
  assert.notEqual(before, after, 'total updates when grams change');
  await shot(page, 'photo-result');
  await page.selectOption('dialog.sheet select[name=meal]', 'lunch');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  await page.waitForSelector('#toast.show');
  assert.match(await page.textContent('#toast'), /午餐/);
  await page.goto(`${BASE}/#/food`);
  await page.waitForSelector('[data-meal="lunch"] .entries');
  assert.ok(await page.$('[data-meal="lunch"] .entries .src'), 'camera icon on photo entries');
  assert.match(await page.textContent('[data-meal="lunch"] .entry-kcal'), /–/);
});

await step('search and add: rice to dinner, then edit and delete', async () => {
  const page = mainPage;
  await page.click('[data-add="dinner"]');
  await page.fill('dialog.sheet input[type=search]', '米饭');
  await page.waitForSelector('dialog.sheet [data-food="rice"]');
  await page.click('dialog.sheet [data-food="rice"]');
  await page.waitForSelector('dialog.sheet .portion');
  assert.match(await page.textContent('dialog.sheet [data-est]'), /195/);
  await page.check('dialog.sheet input[name=mult][value="2"]', { force: true });
  assert.equal(await page.inputValue('dialog.sheet input[name=grams]'), '300');
  assert.match(await page.textContent('dialog.sheet [data-est]'), /390/);
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('[data-meal="dinner"] .entries');
  assert.match(await page.textContent('[data-meal="dinner"]'), /米饭/);
  await page.click('[data-meal="dinner"] .entry');
  await page.fill('dialog.sheet input[name=grams]', '150');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  await page.waitForFunction(() => document.querySelector('[data-meal="dinner"] .entry-kcal')?.textContent.includes('195'));
  await page.click('[data-meal="dinner"] .entry');
  await page.click('dialog.sheet [data-delete]');
  await page.waitForSelector('[data-meal="dinner"] .meal-empty');
});

await step('custom food and the recent list', async () => {
  const page = mainPage;
  await page.click('[data-add="snack"]');
  await page.click('dialog.sheet [data-tab="custom"]');
  await page.fill('dialog.sheet input[name=name]', '燕麦奶拿铁');
  await page.fill('dialog.sheet input[name=kcal]', '160');
  await page.fill('dialog.sheet input[name=protein]', '3');
  await page.fill('dialog.sheet input[name=grams]', '400');
  await page.click('dialog.sheet button[type=submit]');
  await page.waitForSelector('[data-meal="snack"] .entries');
  assert.match(await page.textContent('[data-meal="snack"]'), /燕麦奶拿铁/);
  await page.click('[data-add="breakfast"]');
  await page.click('dialog.sheet [data-tab="recent"]');
  await page.waitForSelector('dialog.sheet [data-recent]');
  assert.match(await page.textContent('dialog.sheet .results'), /燕麦奶拿铁/);
  await page.keyboard.press('Escape');
});

await step('weight: log today and see it in the table', async () => {
  const page = mainPage;
  await page.goto(`${BASE}/#/weight`);
  await page.waitForSelector('[data-log]');
  await page.fill('[data-log] input[name=kg]', '71.6');
  await page.fill('[data-log] input[name=waist]', '86');
  await page.click('[data-log] button[type=submit]');
  await page.waitForFunction(() => document.querySelector('.data-table tbody tr td:nth-child(2)')?.textContent === '71.6');
  assert.ok(await page.$('[data-chart] svg .trend-line'));
  await noHorizontalScroll(page);
});

await step('training: do a session, see progression, undo it', async () => {
  const page = mainPage;
  await page.goto(`${BASE}/#/train/0`);
  await page.waitForSelector('[data-start]');
  const names = await page.$$eval('.exercise h3', (els) => els.map((e) => e.textContent));
  assert.ok(names.length >= 3, names.join());
  assert.ok(!names.includes('徒手深蹲'), 'knee injury: no bodyweight squat');
  assert.ok(names.includes('坐箱深蹲'), names.join());
  await page.click('[data-start]');
  await page.waitForSelector('.set');
  const checks = await page.$$('.set [data-done]');
  for (const c of checks) await c.click();
  await page.waitForSelector('.rest-bar');
  await shot(page, 'train-session');
  await page.click('[data-finish]');
  await page.waitForSelector('.changes li');
  const changes = await page.$$eval('.changes li', (els) => els.map((e) => e.textContent));
  assert.ok(changes.some((c) => /下次/.test(c)), changes.join(' | '));
  await shot(page, 'train-done');
  await page.click('[data-undo]');
  await page.waitForSelector('[data-start]');
});

await step('language switch to English updates the whole UI', async () => {
  const page = mainPage;
  await page.goto(`${BASE}/#/me`);
  await page.waitForSelector('.me');
  await page.click('label:has(input[name=lang][value=en])');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Me');
  assert.equal(await page.textContent('.tabbar .tab.active span'), 'Me');
  await page.goto(`${BASE}/#/food`);
  await page.waitForSelector('.food');
  assert.equal(await page.textContent('h1'), 'Food');
  assert.match(await page.textContent('[data-meal="lunch"]'), /Lunch/);
  await shot(page, 'food-en');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

await step('screening: eating-disorder history gets no plan, and help resources', async () => {
  const page = await newPage();
  await register(page);
  await fillOnboarding(page, { goal: '68', days: 120, health: ['eatingDisorder'] });
  await page.waitForSelector('.resources');
  assert.equal(await page.textContent('h1'), '这次先不做减脂计划');
  assert.match(await page.textContent('.resources'), /1-866-633-4220/);
  assert.equal(await page.$('input[name=option]'), null);
  await shot(page, 'ob-blocked');
  await page.context().close();
});

await step('screening: diabetes medication needs a doctor acknowledgement', async () => {
  const page = await newPage();
  await register(page);
  await fillOnboarding(page, { goal: '68', days: 120, health: ['diabetesMeds'] });
  await page.waitForSelector('.options');
  assert.equal(await page.textContent('h1'), '你的目标可以安全达到');
  assert.equal(await page.$eval('input[name=option]:checked', (e) => e.value), 'requested');
  await page.click('button[type=submit]');
  assert.match(await page.textContent('.form-error'), /勾选/);
  await page.check('input[name=ack]', { force: true });
  await page.click('button[type=submit]');
  await page.waitForSelector('.summary-grid');
  await page.context().close();
});

await step('units: entering weight in 斤 converts to kg behind the scenes', async () => {
  const page = await newPage();
  await register(page);
  await page.check('input[name=units][value=jin]', { force: true });
  await page.waitForFunction(() => document.querySelector('input[name=weight]')?.closest('.input-unit')?.textContent.includes('斤'));
  await page.check('input[name=sex][value=male]', { force: true });
  await page.fill('input[name=age]', '30');
  await page.fill('input[name=heightCm]', '175');
  await page.fill('input[name=weight]', '170');
  await page.click('button[type=submit]');
  await page.waitForSelector('input[name=goal]');
  assert.match(await page.textContent('.page'), /斤/);
  const me = await page.evaluate(async () => (await fetch('/api/me')).json());
  assert.equal(me.user.units, 'jin');
  await page.context().close();
});

await step('demo account: every tab loads, no errors, dark mode', async () => {
  const page = await newPage({ scheme: 'dark' });
  await page.goto(BASE);
  await page.click('[data-demo]');
  await page.waitForSelector('.budget');
  assert.ok(await page.$('.notice-demo'));
  await shot(page, 'demo-today-dark');
  for (const tab of ['food', 'train', 'weight', 'me']) {
    await page.click(`.tabbar a[href="#/${tab}"]`);
    await page.waitForSelector(`body[data-page="${tab}"] .page h1`);
    await page.waitForTimeout(150);
    await noHorizontalScroll(page);
    await shot(page, `demo-${tab}-dark`);
    if (tab === 'weight') {
      const dots = await page.$$eval('[data-chart] .dot-day', (els) => els.length);
      assert.ok(dots > 15, `weight chart shows ${dots} days`);
    }
  }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

await step('logged-out visitors are sent to the welcome page', async () => {
  const page = await newPage({ locale: 'en-US' });
  await page.goto(`${BASE}/#/weight`);
  await page.waitForSelector('.welcome');
  assert.equal(await page.textContent('h1'), 'This is your captain speaking. Destination: your goal weight.');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

// ------------------------------------------------- camera rep counting (real MediaPipe)
// Chromium's fake camera plays two squat photos back and forth; the real pose model
// runs in the page and should count the squats. Needs the pose model: set
// POSE_MODEL_FILE to a local copy, otherwise it is downloaded from Google once.

async function poseModel() {
  if (process.env.POSE_MODEL_FILE) return process.env.POSE_MODEL_FILE;
  const file = path.join(os.tmpdir(), 'glidepath-pose_landmarker_lite.task');
  if (fs.existsSync(file)) return file;
  try {
    const { DEFAULT_POSE_MODEL_URL } = await import('../../server/index.js');
    const res = await fetch(DEFAULT_POSE_MODEL_URL, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return file;
  } catch {
    return null;
  }
}

const modelFile = await poseModel();
if (!modelFile) {
  results.push('skip camera rep counting (no pose model: set POSE_MODEL_FILE or allow downloads from storage.googleapis.com)');
} else {
  await step('camera: counts squats from video with the real pose model, then logs the set', async () => {
    // 30 fps MJPEG: 0.9 s standing, 0.9 s at the bottom, repeated
    const up = fs.readFileSync(path.join(HERE, '../fixtures/goblet-0.jpg'));
    const down = fs.readFileSync(path.join(HERE, '../fixtures/goblet-1.jpg'));
    const frames = [];
    for (let c = 0; c < 8; c++) frames.push(...Array(27).fill(up), ...Array(27).fill(down));
    const video = path.join(tmp, 'squats.mjpeg');
    fs.writeFileSync(video, Buffer.concat(frames));

    const cam = createApp({ dbPath: path.join(tmp, 'cam.db'), anthropicKey: null, openaiKey: null, demoLimit: 1000, poseModelFile: modelFile, log: () => {} });
    const camServer = cam.app.listen(0);
    const CAM = `http://127.0.0.1:${camServer.address().port}`;
    const camBrowser = await chromium.launch({
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
    });
    try {
      const ctx = await camBrowser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'zh-CN', timezoneId: 'America/Toronto' });
      await ctx.grantPermissions(['camera'], { origin: CAM });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(CAM);
      await page.click('[data-demo]');
      await page.waitForSelector('.budget');
      await page.goto(`${CAM}/#/train/0`);
      await page.waitForSelector('.exercise');
      assert.ok(await page.$('.exercise .demo img'), 'demo photos shown');
      if (await page.$('[data-start]')) await page.click('[data-start]');
      const squat = page.locator('.exercise[data-slot="squat"]');
      assert.equal(await squat.locator('h3').textContent(), '高脚杯深蹲');
      assert.equal(await squat.locator('[data-cam]').textContent(), '用摄像头数第 1 组');
      await squat.locator('[data-cam]').click();
      await page.waitForSelector('dialog.sheet .cam-stage video');
      await page.waitForFunction(() => Number(document.querySelector('[data-count]')?.textContent) >= 3, null, { timeout: 60000 });
      await shot(page, 'camera-counting');
      const status = await page.textContent('[data-status]');
      assert.doesNotMatch(status, /加载|没加载/, status);
      // the count can keep going while we click, so read what was saved from the button label
      const label = await page.textContent('dialog.sheet [data-save]');
      await page.click('dialog.sheet [data-save]');
      await page.waitForSelector('dialog.sheet', { state: 'detached' });
      const first = squat.locator('.set').first();
      const saved = Number(await first.locator('input[name=reps]').inputValue());
      assert.ok(saved >= 3 && saved <= 8, `saved ${saved}, button said "${label}"`);
      assert.match(await first.getAttribute('class'), /set-done/);
      assert.equal(await squat.locator('[data-cam]').textContent(), '用摄像头数第 2 组');
      assert.deepEqual(errors, []);
    } finally {
      await camBrowser.close();
      camServer.close();
      cam.close();
    }
  });
}

await browser.close();
server.close();
close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
