import { html, mount, on, $, toast, icon } from '../ui.js';
import { t, fmtNum, fmtDate, getLang } from '../i18n.js';
import { get, post } from '../api.js';
import { state, go, today, refreshMe, route } from '../app.js';
import { kgToDisplay, displayToKg, weightUnit, cmToDisplay, displayToCm, lengthUnit } from '../units.js';
import { weekBars } from '../charts.js';
import { proteinIdeas } from '../core/foods.js';
import { TRACKING_ITEMS } from '../core/body.js';
import {
  signalBanner, demoBanner, mealForNow, cycleHeadline, cycleActions, bindCycleActions, waterControl, bindWater, saveTracking,
} from './shared.js';
import { openPhotoSheet, openAddSheet } from './food.js';

function ruler(eaten, low, high, target) {
  const max = Math.max(target * 1.25, high, eaten) || 1;
  const pct = (v) => `${Math.min(100, (v / max) * 100).toFixed(2)}%`;
  const ticks = [];
  for (let v = 500; v < max; v += 500) ticks.push(v);
  return html`
    <div class="ruler" aria-hidden="true">
      <div class="ruler-track">
        ${high - low >= 40 ? html`<span class="ruler-range" style="left:${pct(low)};width:calc(${pct(high)} - ${pct(low)})"></span>` : ''}
        <span class="ruler-fill" style="width:${pct(eaten)}"></span>
        <span class="ruler-target" style="left:${pct(target)}"></span>
      </div>
      <div class="ruler-ticks">${ticks.map((v) => html`<span style="left:${pct(v)}">${v % 1000 === 0 ? fmtNum(v) : ''}</span>`)}</div>
    </div>`;
}

export async function render(root, params, alive) {
  const d = await get(`/dashboard?today=${today()}`);
  if (!alive()) return;
  if (d.needsOnboarding) return go('onboarding');
  const units = state.user.units;
  const wu = t(`unit.${weightUnit(units)}`);
  const tg = d.targets;
  const eaten = d.intake.kcal;
  const left = tg.calories - eaten;
  const over = left < 0;
  const protein = d.intake.protein;
  const proteinPct = Math.min(100, (protein / tg.protein.min) * 100);
  const w = d.weight;
  const wo = d.workout;
  const day = wo.day;
  const avgDiff = d.weekAvg ? d.weekAvg.kcal - tg.calories : null;
  const tr = d.tracking;
  const body = d.body;
  const lu = lengthUnit(units);
  const cycle = body.cycle;
  const waist = body.waist;
  const showIntro = !tr.introDismissed && !TRACKING_ITEMS.some((k) => tr[k]);
  const cyc = tr.cycle ? cycleHeadline(cycle) : null;

  mount(root, html`
    <section class="page today">
      <header class="page-head">
        <h1>${t('today.title')}</h1>
        <span class="page-date">${fmtDate(d.today, 'long')}</span>
      </header>
      ${demoBanner(state.user)}
      ${signalBanner(d.signals)}
      ${cycle?.missed ? html`<div class="notice notice-care" role="note">${icon('heart')}<div>
        <p>${t('cycle.missed')}</p><p>${t('cycle.missedPregnant')}</p>
        <a class="btn btn-small" href="#/body">${t('cycle.missedLog')}</a></div></div>` : ''}

      <div class="hero-sheet grid-paper budget">
        <p class="budget-label">${d.phase === 'maintain' ? t('today.maintainLabel') : over ? t('today.overLabel') : t('today.leftLabel')}</p>
        <p class="budget-num"><span class="hl">${fmtNum(Math.abs(left))}</span><small>kcal</small></p>
        ${ruler(eaten, d.intake.low, d.intake.high, tg.calories)}
        <div class="budget-facts">
          <span><small>${t('today.eaten')}</small><b>${fmtNum(eaten)}</b></span>
          <span><small>${t('today.target')}</small><b>${fmtNum(tg.calories)}</b></span>
          ${d.intake.high - d.intake.low >= 40 ? html`<span><small>${t('today.range')}</small><b>${fmtNum(d.intake.low)}–${fmtNum(d.intake.high)}</b></span>` : ''}
        </div>
        ${over ? html`<p class="hint">${t('today.overHint')}</p>` : ''}
        <div class="meter" role="img" aria-label="${t('today.proteinAria', { n: fmtNum(protein), min: tg.protein.min })}">
          <div class="meter-label"><span>${t('today.protein')}</span><span><b>${fmtNum(protein)}</b> / ${tg.protein.min}–${tg.protein.max} g</span></div>
          <div class="meter-track"><span style="width:${proteinPct.toFixed(1)}%"></span></div>
        </div>
        <div class="hero-actions">
          <button class="btn btn-primary" type="button" data-photo>${icon('camera')}<span>${t('food.photoMeal')}</span></button>
          <button class="btn" type="button" data-add>${icon('search')}<span>${t('today.searchAdd')}</span></button>
        </div>
      </div>

      ${w.needsRecalc ? html`<div class="notice notice-info">
        <p>${t('today.recalc', { diff: fmtNum(Math.abs(kgToDisplay(w.trend, units) - kgToDisplay(tg.basedOnKg, units)), 1), unit: wu })}</p>
        <button class="btn btn-small" type="button" data-recalc>${t('today.recalcBtn')}</button></div>` : ''}
      ${w.reachedGoal ? html`<div class="notice notice-good">
        <p>${t('today.reached')}</p><button class="btn btn-small" type="button" data-maintain>${t('today.maintainBtn')}</button></div>` : ''}
      ${w.plateau ? html`<div class="notice"><p><b>${t('today.plateauTitle')}</b></p><p>${t('today.plateau')}</p></div>` : ''}
      ${w.waistDown ? html`<div class="notice notice-good"><p><b>${t('today.waistDownTitle')}</b></p>
        <p>${t('today.waistDown', { weeks: w.waistDown.weeks, v: fmtNum(cmToDisplay(w.waistDown.cm, units), 1), unit: lu })}</p></div>` : ''}
      ${body.poorSleep ? html`<div class="notice notice-info"><p><b>${t('today.poorSleepTitle')}</b></p><p>${t('today.poorSleep')}</p></div>` : ''}

      <section class="block">
        <header class="block-head"><h2>${t('today.training')}</h2>
          <span class="muted">${t('today.weekCount', { done: wo.week.done, planned: wo.week.planned })}</span></header>
        ${wo.log ? html`<p class="done-line">${icon('check')}<span>${t('today.trainedDone', { day: t(`day.${wo.log.key}`) })}</span></p>`
          : day ? html`<p>${t('today.trainPlan', { day: t(`day.${day.key}`), n: day.slots.length, min: day.minutes })}</p>
            <a class="btn btn-block" href="#/train">${t('today.startTraining')}</a>`
          : html`<p class="muted">${t('today.rest', { steps: fmtNum(tg.steps) })}</p>`}
      </section>

      <section class="block">
        <header class="block-head"><h2>${t('today.weight')}</h2>
          ${w.trend ? html`<span class="muted">${t('today.trend', { v: fmtNum(kgToDisplay(w.trend, units), 1), unit: wu })}</span>` : ''}</header>
        ${w.weeklyChange !== null ? html`<p>${t(w.weeklyChange <= 0 ? 'today.losing' : 'today.gaining', { v: fmtNum(Math.abs(kgToDisplay(w.weeklyChange, units, 2)), 2), unit: wu })}
          ${w.projectedEnd ? t('today.projected', { date: fmtDate(w.projectedEnd, 'year') }) : ''}</p>` : html`<p class="muted">${t('today.needMore')}</p>`}
        ${w.cycleWater ? html`<p class="hint cycle-hint">${t('today.cycleWater')}</p>` : ''}
        ${w.loggedToday ? html`<p class="done-line">${icon('check')}<span>${t('today.weighedToday', { v: fmtNum(kgToDisplay(w.latest.kg, units), 1), unit: wu })}</span></p>`
          : html`<form class="inline-form" data-weigh novalidate>
            <label class="sr-only" for="w-today">${t('today.weighPh')}</label>
            <div class="input-unit"><input id="w-today" name="kg" type="number" inputmode="decimal" step="0.1" placeholder="${t('today.weighPh')}"><em>${wu}</em></div>
            <button class="btn" type="submit">${t('common.save')}</button></form>`}
      </section>

      ${tr.cycle ? html`<section class="block cycle-block">
        <header class="block-head"><h2>${t('body.item.cycle')}</h2><a class="muted" href="#/body">${t('today.bodyLink')}</a></header>
        <p class="cycle-line"><b>${cyc.title}</b>${cyc.detail ? html`<span>${cyc.detail}</span>` : ''}</p>
        ${cycleActions(cycle)}
      </section>` : ''}

      ${waist?.due ? html`<section class="block">
        <header class="block-head"><h2>${t('today.waistTitle')}</h2><a class="muted" href="#/body">${t('today.bodyLink')}</a></header>
        <p class="hint">${waist.latest ? t('today.waistLast', { date: fmtDate(waist.latest.date, 'short'), v: fmtNum(cmToDisplay(waist.latest.cm, units), 1), unit: lu }) : ''} ${t('today.waistHow')}</p>
        <form class="inline-form" data-waist novalidate>
          <label class="sr-only" for="waist-today">${t('body.item.waist')}</label>
          <div class="input-unit"><input id="waist-today" name="cm" type="number" inputmode="decimal" step="0.5" placeholder="${t('body.item.waist')}"><em>${lu}</em></div>
          <button class="btn" type="submit">${t('common.save')}</button>
        </form>
      </section>` : ''}

      <section class="block">
        <header class="block-head"><h2>${t('today.checkin')}</h2></header>
        <form class="checkin" data-checkin novalidate>
          <label class="field"><span>${t('today.steps')}</span>
            <input name="steps" type="number" inputmode="numeric" min="0" max="100000" value="${d.daily.steps ?? ''}" placeholder="${fmtNum(tg.steps)}">
            <small>${t('today.stepsGoal', { n: fmtNum(tg.steps) })}</small></label>
          <label class="field"><span>${t('today.sleep')}</span>
            <input name="sleepHours" type="number" inputmode="decimal" step="0.5" min="0" max="24" value="${d.daily.sleepHours ?? ''}" placeholder="${tg.sleep.hours}">
            <small>${t('today.sleepGoal', { bed: tg.sleep.bedtime, wake: tg.sleep.wake })}</small></label>
          ${tr.sleepQuality ? html`<fieldset class="group checkin-wide">
            <legend>${t('today.sleepQuality')}</legend>
            <div class="segmented">
              ${[3, 2, 1].map((q) => html`<label><input type="radio" name="sleepQuality" value="${q}" ${d.daily.sleepQuality === q ? 'checked' : ''}><span>${t(`sleepq.${q}`)}</span></label>`)}
            </div>
          </fieldset>` : ''}
          <button class="btn" type="submit">${t('common.save')}</button>
        </form>
        ${body.water ? waterControl(d.daily.waterMl ?? 0, body.water) : ''}
      </section>

      ${showIntro ? html`<div class="notice notice-info intro-card">
        <p><b>${t('today.introTitle')}</b></p>
        <p>${t('today.intro')}</p>
        <div class="row-actions"><a class="btn btn-small btn-primary" href="#/body">${t('today.introGo')}</a>
          <button class="btn btn-small" type="button" data-intro-dismiss>${t('today.introNo')}</button></div>
      </div>` : ''}

      <section class="block">
        <header class="block-head"><h2>${t('today.week')}</h2></header>
        ${d.weekAvg ? html`<p>${t('today.weekAvg', { kcal: fmtNum(d.weekAvg.kcal), days: d.weekAvg.days })}
          ${avgDiff <= 0 ? t('today.weekUnder', { n: fmtNum(-avgDiff) }) : t('today.weekOver', { n: fmtNum(avgDiff) })}</p>` : html`<p class="muted">${t('today.weekEmpty')}</p>`}
        <div class="chart-box" data-week></div>
      </section>

      ${protein < tg.protein.min * 0.5 && d.intake.count >= 2 && new Date().getHours() >= 15 ? html`<section class="block">
        <header class="block-head"><h2>${t('today.proteinIdeas')}</h2></header>
        <p class="muted">${t('today.proteinIdeasLead')}</p>
        <ul class="idea-list">${proteinIdeas(d.diet).slice(0, 5).map((f) => html`<li><span>${getLang() === 'en' ? f.en : f.zh}</span><small>${t('today.proteinPer', { g: Math.round(f.p * f.g / 100), portion: f.u[getLang() === 'en' ? 1 : 0] })}</small></li>`)}</ul>
      </section>` : ''}
    </section>`);

  weekBars($('[data-week]', root), d.week, tg.calories, {
    labels: { aria: t('today.weekAria'), target: t('today.targetShort', { n: fmtNum(tg.calories) }), none: t('today.notLogged') },
    dayLabel: (date, isToday) => (isToday ? t('common.today') : fmtDate(date, 'weekday')),
    fmtDate: (date) => fmtDate(date, 'long'),
    fmtKcal: (n) => fmtNum(n),
  });

  const reload = () => route();
  on(root, 'click', '[data-photo]', () => openPhotoSheet({ date: today(), meal: mealForNow(), onSaved: reload }));
  on(root, 'click', '[data-add]', () => openAddSheet({ date: today(), meal: mealForNow(), onSaved: reload }));
  on(root, 'click', '[data-recalc]', async () => {
    await post('/plan/recalc', { today: today() });
    await refreshMe();
    toast(t('today.recalcDone'));
    reload();
  });
  on(root, 'click', '[data-maintain]', async () => {
    await post('/plan/maintain', { today: today() });
    await refreshMe();
    toast(t('today.maintainDone'));
    reload();
  });
  const weigh = $('[data-weigh]', root);
  weigh?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kg = displayToKg(weigh.kg.value, units);
    if (!(kg >= 30 && kg <= 300)) return toast(t('err.bad_weight'));
    await post('/weights', { date: today(), kg });
    toast(t('common.saved'));
    reload();
  });
  const checkin = $('[data-checkin]', root);
  const quality = () => Number(checkin.querySelector('[name=sleepQuality]:checked')?.value) || null;
  checkin.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await post('/daily', {
        date: today(),
        steps: checkin.steps.value === '' ? null : Math.round(Number(checkin.steps.value)),
        sleepHours: checkin.sleepHours.value === '' ? null : Number(checkin.sleepHours.value),
        sleepQuality: quality(),
      });
      toast(t('common.saved'));
    } catch (err) {
      toast(t(`err.${err.code}`, {}, t('err.generic')));
    }
  });
  // one tap is enough for sleep quality: save it straight away
  on(checkin, 'change', '[name=sleepQuality]', async () => {
    try {
      await post('/daily', { date: today(), sleepQuality: quality() });
      toast(t('common.saved'));
    } catch (err) {
      toast(t(`err.${err.code}`, {}, t('err.generic')));
    }
  });
  bindWater(root, today());
  bindCycleActions(root, reload);
  const waistForm = $('[data-waist]', root);
  waistForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cm = displayToCm(waistForm.cm.value, units);
    if (waistForm.cm.value === '' || !(cm >= 40 && cm <= 250)) return toast(t('err.bad_waist'));
    try {
      await post('/waist', { date: today(), cm });
      toast(t('common.saved'));
      reload();
    } catch (err) {
      toast(t(`err.${err.code}`, {}, t('err.generic')));
    }
  });
  on(root, 'click', '[data-intro-dismiss]', async () => {
    await saveTracking({ introDismissed: true });
    reload();
  });
}
