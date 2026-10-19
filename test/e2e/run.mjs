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
const { app, close } = createApp({ dbPath: path.join(tmp, 'e2e.db'), openaiKey: null, authLimit: 1000, demoLimit: 1000, log: () => {} });
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

await browser.close();
server.close();
close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
