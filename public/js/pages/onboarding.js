import { html, mount, on, $, formData } from '../ui.js';
import { t, fmtNum, fmtDate, weekdayShort, exName, getLang } from '../i18n.js';
import { post } from '../api.js';
import { state, refreshMe, today } from '../app.js';
import { addDays, daysBetween } from '../core/dates.js';
import { tdee, intakeFloor, LIMITS } from '../core/plan.js';
import { kgToDisplay, displayToKg, weightUnit, cmToFtIn, ftInToCm } from '../units.js';
import { helpResources } from './shared.js';

const STEPS = ['about', 'goal', 'health', 'life', 'training'];
const DRAFT_KEY = 'glidepath.draft';

let draft = null;
let step = 0;
let units = 'metric';

function loadDraft() {
  if (state.profile) return structuredClone(state.profile);
  try {
    const s = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (s && typeof s === 'object') return s;
  } catch { /* ignore */ }
  return {
    sex: null, age: '', heightCm: '', weightKg: '', goalKg: '', targetDate: addDays(today(), 120),
    activity: 'light', experience: 'beginner', equipment: 'none', trainDays: [0, 2, 4], sessionMin: 30,
    injuries: [], diet: 'none', allergies: '', bedtime: '23:00', wake: '07:00',
    screening: { pregnant: false, eatingDisorder: false, diabetesMeds: false, otherCondition: false },
    fitnessTest: { pushups: null, squats: null, plankSec: null },
  };
}

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

const radio = (name, value, current, label, hint) => html`
  <label class="choice">
    <input type="radio" name="${name}" value="${value}" ${String(current) === String(value) ? 'checked' : ''}>
    <span class="choice-body"><b>${label}</b>${hint ? html`<small>${hint}</small>` : ''}</span>
  </label>`;

const check = (name, value, checked, label, group = true) => html`
  <label class="choice choice-check">
    <input type="checkbox" name="${name}" value="${value}" ${group ? html`data-group` : ''} ${checked ? 'checked' : ''}>
    <span class="choice-body"><b>${label}</b></span>
  </label>`;

const disp = (kg) => (kg === '' || kg === null || kg === undefined ? '' : kgToDisplay(Number(kg), units));

function stepAbout() {
  const ft = draft.heightCm ? cmToFtIn(draft.heightCm) : { ft: '', inch: '' };
  return html`
    <fieldset class="group">
      <legend>${t('ob.sex')}</legend>
      <div class="choices choices-row">
        ${radio('sex', 'female', draft.sex, t('ob.sex.female'))}
        ${radio('sex', 'male', draft.sex, t('ob.sex.male'))}
        ${radio('sex', 'other', draft.sex, t('ob.sex.other'))}
      </div>
      <small class="hint">${t('ob.sex.hint')}</small>
    </fieldset>
    <label class="field"><span>${t('ob.age')}</span>
      <input name="age" type="number" inputmode="numeric" min="10" max="100" value="${draft.age}" required></label>
    <fieldset class="group">
      <legend>${t('ob.units')}</legend>
      <div class="segmented">
        ${['metric', 'jin', 'imperial'].map((u) => html`<label><input type="radio" name="units" value="${u}" ${units === u ? 'checked' : ''}><span>${t(`units.${u}`)}</span></label>`)}
      </div>
    </fieldset>
    ${units === 'imperial' ? html`
      <div class="field-row">
        <label class="field"><span>${t('ob.heightFt')}</span><input name="ft" type="number" inputmode="numeric" min="3" max="8" value="${ft.ft}"></label>
        <label class="field"><span>${t('ob.heightIn')}</span><input name="inch" type="number" inputmode="numeric" min="0" max="11" value="${ft.inch}"></label>
      </div>` : html`
      <label class="field"><span>${t('ob.height')}</span>
        <div class="input-unit"><input name="heightCm" type="number" inputmode="decimal" min="120" max="230" step="0.5" value="${draft.heightCm}"><em>cm</em></div></label>`}
    <label class="field"><span>${t('ob.weight')}</span>
      <div class="input-unit"><input name="weight" type="number" inputmode="decimal" step="0.1" value="${disp(draft.weightKg)}"><em>${t(`unit.${weightUnit(units)}`)}</em></div></label>`;
}

function goalPreview() {
  const w = Number(draft.weightKg);
  const g = Number(draft.goalKg);
  const days = daysBetween(today(), draft.targetDate || today());
  if (!w || !g || !draft.targetDate) return '';
  if (g >= w) return html`<div class="notice"><p>${t('ob.goal.notLower')}</p></div>`;
  if (days < 7) return html`<div class="notice notice-warn"><p>${t('ob.goal.tooSoon')}</p></div>`;
  const perWeek = ((w - g) / days) * 7;
  const pct = perWeek / w;
  const ok = pct <= LIMITS.maxWeeklyPct;
  return html`<div class="notice ${ok ? 'notice-good' : 'notice-warn'}" aria-live="polite">
    <p>${t('ob.goal.pace', { amount: fmtNum(kgToDisplay(perWeek, units, 2), 2), unit: t(`unit.${weightUnit(units)}`), pct: fmtNum(pct * 100, 2) })}</p>
    <p><b>${ok ? t('ob.goal.ok') : t('ob.goal.tooFast')}</b></p>
  </div>`;
}

function stepGoal() {
  return html`
    <label class="field"><span>${t('ob.goalWeight')}</span>
      <div class="input-unit"><input name="goal" type="number" inputmode="decimal" step="0.1" value="${disp(draft.goalKg)}"><em>${t(`unit.${weightUnit(units)}`)}</em></div></label>
    <label class="field"><span>${t('ob.targetDate')}</span>
      <input name="targetDate" type="date" min="${addDays(today(), 7)}" value="${draft.targetDate}"></label>
    <div data-preview>${goalPreview()}</div>
    <p class="hint">${t('ob.goal.explain')}</p>`;
}

function stepHealth() {
  const s = draft.screening;
  return html`
    <p class="lead">${t('ob.health.lead')}</p>
    <div class="choices">
      ${check('pregnant', '1', s.pregnant, t('ob.health.pregnant'), false)}
      ${check('eatingDisorder', '1', s.eatingDisorder, t('ob.health.ed'), false)}
      ${check('diabetesMeds', '1', s.diabetesMeds, t('ob.health.diabetes'), false)}
      ${check('otherCondition', '1', s.otherCondition, t('ob.health.other'), false)}
    </div>
    <p class="hint">${t('ob.health.private')}</p>`;
}

function stepLife() {
  return html`
    <fieldset class="group">
      <legend>${t('ob.activity')}</legend>
      <div class="choices">
        ${['sedentary', 'light', 'moderate', 'active'].map((a) => radio('activity', a, draft.activity, t(`activity.${a}`), t(`activity.${a}.hint`)))}
      </div>
    </fieldset>
    <div class="field-row">
      <label class="field"><span>${t('ob.bedtime')}</span><input name="bedtime" type="time" value="${draft.bedtime}"></label>
      <label class="field"><span>${t('ob.wake')}</span><input name="wake" type="time" value="${draft.wake}"></label>
    </div>
    <fieldset class="group">
      <legend>${t('ob.diet')}</legend>
      <div class="choices choices-row">
        ${['none', 'vegetarian', 'vegan'].map((d) => radio('diet', d, draft.diet, t(`diet.${d}`)))}
      </div>
    </fieldset>
    <label class="field"><span>${t('ob.allergies')}</span>
      <input name="allergies" type="text" maxlength="200" value="${draft.allergies}" placeholder="${t('ob.allergies.ph')}"></label>`;
}

function stepTraining() {
  const ft = draft.fitnessTest || {};
  return html`
    <fieldset class="group">
      <legend>${t('ob.experience')}</legend>
      <div class="choices">
        ${['beginner', 'intermediate', 'advanced'].map((x) => radio('experience', x, draft.experience, t(`exp.${x}`), t(`exp.${x}.hint`)))}
      </div>
    </fieldset>
    <fieldset class="group">
      <legend>${t('ob.equipment')}</legend>
      <div class="choices">
        ${['none', 'dumbbells', 'gym'].map((x) => radio('equipment', x, draft.equipment, t(`equip.${x}`)))}
      </div>
    </fieldset>
    <fieldset class="group">
      <legend>${t('ob.days')}</legend>
      <div class="day-chips">
        ${[0, 1, 2, 3, 4, 5, 6].map((d) => html`<label class="chip"><input type="checkbox" name="trainDays" value="${d}" data-group ${draft.trainDays.includes(d) ? 'checked' : ''}><span>${weekdayShort(d)}</span></label>`)}
      </div>
      <small class="hint">${t('ob.days.hint')}</small>
    </fieldset>
    <fieldset class="group">
      <legend>${t('ob.session')}</legend>
      <div class="segmented">
        ${[20, 30, 45, 60, 75].map((m) => html`<label><input type="radio" name="sessionMin" value="${m}" ${Number(draft.sessionMin) === m ? 'checked' : ''}><span>${m}</span></label>`)}
      </div>
      <small class="hint">${t('ob.session.hint')}</small>
    </fieldset>
    <fieldset class="group">
      <legend>${t('ob.injuries')}</legend>
      <div class="choices choices-row">
        ${['knee', 'back', 'shoulder', 'wrist'].map((x) => check('injuries', x, draft.injuries.includes(x), t(`injury.${x}`)))}
      </div>
    </fieldset>
    <details class="group test" ${ft.pushups != null || ft.squats != null || ft.plankSec != null ? 'open' : ''}>
      <summary>${t('ob.test')}</summary>
      <p class="hint">${t('ob.test.hint')}</p>
      <label class="field"><span>${t('ob.test.pushups')}</span><input name="pushups" type="number" inputmode="numeric" min="0" max="200" value="${ft.pushups ?? ''}"></label>
      <label class="field"><span>${t('ob.test.squats')}</span><input name="squats" type="number" inputmode="numeric" min="0" max="300" value="${ft.squats ?? ''}"></label>
      <label class="field"><span>${t('ob.test.plank')}</span><input name="plankSec" type="number" inputmode="numeric" min="0" max="900" value="${ft.plankSec ?? ''}"></label>
    </details>`;
}

const RENDER = { about: stepAbout, goal: stepGoal, health: stepHealth, life: stepLife, training: stepTraining };

/** Copies the current form into the draft. Returns a list of error messages. */
function collect(form) {
  const f = formData(form);
  const errs = [];
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  const name = STEPS[step];
  if (name === 'about') {
    draft.sex = f.sex;
    draft.age = num(f.age);
    if (f.units && f.units !== units) units = f.units;
    if ('ft' in f) draft.heightCm = Math.round(ftInToCm(num(f.ft), num(f.inch) || 0) * 10) / 10;
    else draft.heightCm = num(f.heightCm);
    draft.weightKg = Math.round(displayToKg(num(f.weight), units) * 10) / 10;
    if (!draft.sex) errs.push(t('ob.err.sex'));
    if (!(draft.age >= 10 && draft.age <= 100)) errs.push(t('ob.err.age'));
    if (!(draft.heightCm >= 120 && draft.heightCm <= 230)) errs.push(t('ob.err.height'));
    if (!(draft.weightKg >= 30 && draft.weightKg <= 300)) errs.push(t('ob.err.weight'));
  } else if (name === 'goal') {
    draft.goalKg = Math.round(displayToKg(num(f.goal), units) * 10) / 10;
    draft.targetDate = f.targetDate;
    if (!(draft.goalKg >= 30 && draft.goalKg <= 300)) errs.push(t('ob.err.goal'));
    if (!draft.targetDate) errs.push(t('ob.err.date'));
  } else if (name === 'health') {
    draft.screening = { pregnant: !!f.pregnant, eatingDisorder: !!f.eatingDisorder, diabetesMeds: !!f.diabetesMeds, otherCondition: !!f.otherCondition };
  } else if (name === 'life') {
    Object.assign(draft, { activity: f.activity, bedtime: f.bedtime, wake: f.wake, diet: f.diet, allergies: f.allergies });
    if (!draft.bedtime || !draft.wake) errs.push(t('ob.err.sleep'));
  } else if (name === 'training') {
    draft.experience = f.experience;
    draft.equipment = f.equipment;
    draft.trainDays = (f.trainDays || []).map(Number);
    draft.sessionMin = Number(f.sessionMin);
    draft.injuries = f.injuries || [];
    draft.fitnessTest = { pushups: f.pushups === '' ? null : num(f.pushups), squats: f.squats === '' ? null : num(f.squats), plankSec: f.plankSec === '' ? null : num(f.plankSec) };
    if (draft.trainDays.length > 6) errs.push(t('ob.err.days'));
  }
  saveDraft();
  return errs;
}

function renderStep(root) {
  const name = STEPS[step];
  mount(root, html`
    <section class="page onboarding">
      <header class="ob-head">
        ${step > 0 ? html`<button class="back-link" type="button" data-prev>${t('common.back')}</button>` : state.plan ? html`<a class="back-link" href="#/me">${t('common.cancel')}</a>` : html`<span></span>`}
        <span class="ob-count">${t('ob.step', { n: step + 1, total: STEPS.length })}</span>
      </header>
      <ol class="ob-progress" aria-hidden="true">${STEPS.map((s, i) => html`<li class="${i <= step ? 'done' : ''}"></li>`)}</ol>
      <h1>${t(`ob.${name}.title`)}</h1>
      <form class="stack" novalidate>
        ${RENDER[name]()}
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">${step === STEPS.length - 1 ? t('ob.makePlan') : t('common.next')}</button>
      </form>
    </section>`);

  const form = $('form', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errs = collect(form);
    const box = $('.form-error', form);
    if (errs.length) {
      box.hidden = false;
      box.textContent = errs.join(' ');
      return;
    }
    if (name === 'about' && state.user && state.user.units !== units) {
      const r = await post('/settings', { units }).catch(() => null);
      if (r) state.user = r.user;
    }
    if (step < STEPS.length - 1) {
      step++;
      renderStep(root);
      window.scrollTo(0, 0);
    } else {
      await evaluate(root, form.querySelector('[type=submit]'));
    }
  });
  on(root.firstElementChild, 'click', '[data-prev]', () => {
    collect(form);
    step--;
    renderStep(root);
  });
  if (name === 'about') {
    on(form, 'change', '[name=units]', () => {
      collect(form);
      renderStep(root);
    });
  }
  if (name === 'goal') {
    const update = () => {
      const f = formData(form);
      draft.goalKg = Math.round(displayToKg(Number(f.goal), units) * 10) / 10;
      draft.targetDate = f.targetDate;
      mount($('[data-preview]', form), goalPreview());
    };
    form.addEventListener('input', update);
  }
}

async function evaluate(root, btn) {
  btn.disabled = true;
  btn.textContent = t('ob.calculating');
  try {
    const r = await post('/profile/evaluate', { profile: draft, today: today() });
    draft = r.profile;
    renderResult(root, r);
    window.scrollTo(0, 0);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = t('ob.makePlan');
    const box = $('.form-error', root);
    box.hidden = false;
    box.textContent = e.code === 'bad_profile' ? t('ob.err.fields') : t(`err.${e.code}`, {}, t('err.generic'));
  }
}

function blockedView(root, screening) {
  mount(root, html`
    <section class="page onboarding">
      <h1>${t('ob.blocked.title')}</h1>
      ${screening.blocked.map((b) => html`<div class="notice"><p>${t(`ob.blocked.${b}`)}</p></div>`)}
      <p>${t('ob.blocked.instead')}</p>
      ${screening.blocked.includes('eatingDisorder') || screening.blocked.includes('underweight') ? helpResources() : ''}
      <button class="btn btn-block" type="button" data-edit>${t('ob.editAnswers')}</button>
    </section>`);
  on(root.firstElementChild, 'click', '[data-edit]', () => { step = 0; renderStep(root); });
}

function issueText(issue, ev, p) {
  const u = t(`unit.${weightUnit(units)}`);
  const r = ev.requested;
  const maxWeek = kgToDisplay(p.weightKg * LIMITS.maxWeeklyPct, units, 2);
  switch (issue) {
    case 'tooFast':
      return t('ob.issue.tooFast', { amount: fmtNum(kgToDisplay(r.weeklyKg, units, 2), 2), unit: u, pct: fmtNum(r.weeklyPct * 100, 1), max: fmtNum(maxWeek, 2) });
    case 'belowFloor':
      return r.intake <= 0
        ? t('ob.issue.impossible', { deficit: fmtNum(r.deficit), tdee: fmtNum(tdee(p)) })
        : t('ob.issue.belowFloor', { intake: fmtNum(Math.round(r.intake / 10) * 10), floor: fmtNum(Math.ceil(intakeFloor(p) / 10) * 10) });
    case 'goalBmiTooLow':
      return t('ob.issue.goalBmi', { goal: fmtNum(kgToDisplay(ev.adjustedGoalKg, units), 1), unit: u });
    case 'dateTooSoon':
      return t('ob.issue.tooSoon');
    case 'smallBudget':
      return t('ob.issue.smallBudget');
    default:
      return '';
  }
}

function optionCard(o, ev, p) {
  const u = t(`unit.${weightUnit(units)}`);
  return html`
    <label class="option">
      <input type="radio" name="option" value="${o.id}" ${o.id === ev.recommended ? 'checked' : ''}>
      <span class="option-body">
        <span class="option-head"><b>${t(`ob.option.${o.id}`)}</b>${o.id === ev.recommended ? html`<em class="tag">${t('ob.recommended')}</em>` : ''}</span>
        <span class="option-desc">${t(`ob.option.${o.id}.desc`, { goal: fmtNum(kgToDisplay(o.goalKg, units), 1), unit: u })}</span>
        <span class="option-facts">
          <span><small>${t('ob.option.reach')}</small><b>${fmtDate(o.endDate, 'year')}</b></span>
          <span><small>${t('ob.option.perWeek')}</small><b>${fmtNum(kgToDisplay(o.weeklyKg, units, 2), 2)} ${u}</b></span>
          <span><small>${t('ob.option.eat')}</small><b>${fmtNum(o.intake)} kcal</b></span>
        </span>
        ${o.floorCapped ? html`<small class="hint">${t('ob.option.capped')}</small>` : ''}
      </span>
    </label>`;
}

function renderResult(root, { screening, evaluation: ev, profile }) {
  if (screening.status === 'blocked') return blockedView(root, screening);
  if (ev.mode === 'maintain') {
    mount(root, html`<section class="page onboarding">
      <h1>${t('ob.maintain.title')}</h1>
      <div class="notice"><p>${t('ob.maintain.body')}</p></div>
      <button class="btn btn-block" type="button" data-edit>${t('ob.editGoal')}</button></section>`);
    on(root.firstElementChild, 'click', '[data-edit]', () => { step = 1; renderStep(root); });
    return;
  }
  const issues = ev.issues.map((i) => issueText(i, ev, profile)).filter(Boolean);
  mount(root, html`
    <section class="page onboarding">
      <header class="ob-head"><button class="back-link" type="button" data-edit>${t('ob.editAnswers')}</button><span></span></header>
      <h1>${ev.feasible ? t('ob.result.okTitle') : t('ob.result.adjustTitle')}</h1>
      ${issues.length ? html`<div class="notice notice-warn">${issues.map((s) => html`<p>${s}</p>`)}</div>` : html`<p class="lead">${t('ob.result.okLead')}</p>`}
      <form class="stack" novalidate>
        <fieldset class="group">
          <legend>${t('ob.result.choose')}</legend>
          <div class="options">${ev.options.map((o) => optionCard(o, ev, profile))}</div>
        </fieldset>
        ${screening.status === 'caution' ? html`
          <div class="notice">
            ${screening.caution.map((c) => html`<p>${t(`ob.caution.${c}`)}</p>`)}
            <label class="choice choice-check"><input type="checkbox" name="ack"><span class="choice-body"><b>${t('ob.caution.ack')}</b></span></label>
          </div>` : ''}
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">${t('ob.usePlan')}</button>
      </form>
      <p class="fineprint">${t('ob.result.note')}</p>
    </section>`);
  on(root.firstElementChild, 'click', '[data-edit]', () => { step = 0; renderStep(root); });
  const form = $('form', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    const box = $('.form-error', form);
    if (screening.status === 'caution' && !f.ack) {
      box.hidden = false;
      box.textContent = t('ob.caution.need');
      return;
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const r = await post('/plan', { optionId: f.option, today: today(), ack: !!f.ack });
      clearDraft();
      await refreshMe();
      renderPlanSummary(root, r.plan);
      window.scrollTo(0, 0);
    } catch (err) {
      btn.disabled = false;
      box.hidden = false;
      box.textContent = t(`err.${err.code}`, {}, t('err.generic'));
    }
  });
}

function renderPlanSummary(root, plan) {
  const tg = plan.targets;
  const u = t(`unit.${weightUnit(units)}`);
  const days = Object.entries(plan.training.week);
  mount(root, html`
    <section class="page onboarding">
      <h1>${t('ob.summary.title')}</h1>
      <p class="lead">${t('ob.summary.lead', { goal: fmtNum(kgToDisplay(tg.goalKg, units), 1), unit: u, date: fmtDate(plan.option.endDate, 'year') })}</p>
      <div class="sheet summary-grid">
        <div><small>${t('target.calories')}</small><b>${fmtNum(tg.calories)}</b><span>kcal</span></div>
        <div><small>${t('target.protein')}</small><b>${tg.protein.min}–${tg.protein.max}</b><span>g</span></div>
        <div><small>${t('target.steps')}</small><b>${fmtNum(tg.steps)}</b><span>${t('unit.steps')}</span></div>
        <div><small>${t('target.sleep')}</small><b>${tg.sleep.bedtime}–${tg.sleep.wake}</b><span>${t('unit.hours', { n: tg.sleep.hours })}</span></div>
      </div>
      ${tg.sleep.enough ? '' : html`<div class="notice notice-warn"><p>${t('ob.summary.shortSleep')}</p></div>`}
      <h2>${t('ob.summary.training')}</h2>
      ${days.length ? html`<ul class="plain-list">${days.map(([wd, d]) => html`
        <li><b>${weekdayShort(Number(wd))}</b><span>${t(`day.${d.key}`)}</span><small>${d.slots.map((s) => exName(s.exerciseId)).join(getLang() === 'zh' ? '、' : ', ')}</small></li>`)}</ul>`
        : html`<p class="muted">${t('ob.summary.noTraining')}</p>`}
      ${plan.training.notes.includes('injury') ? html`<div class="notice"><p>${t('train.injuryNote')}</p></div>` : ''}
      <a class="btn btn-primary btn-block" href="#/today">${t('ob.summary.start')}</a>
    </section>`);
}

export async function render(root) {
  units = state.user?.units || 'metric';
  draft = loadDraft();
  draft.fitnessTest ||= { pushups: null, squats: null, plankSec: null };
  step = 0;
  renderStep(root);
}
