import { html, mount, on, $, $$, toast, icon } from '../ui.js';
import { t, fmtDate, exName, exCues, weekdayShort } from '../i18n.js';
import { get, post, del } from '../api.js';
import { today, route } from '../app.js';
import { addDays, weekday } from '../core/dates.js';
import { EXERCISES, demoImages } from '../core/training.js';
import { isCountable } from '../core/reps.js';
import { openCounter } from '../camera.js';

const DRAFT = (date) => `glidepath.session.${date}`;
let restTimer = null;

function prescription(s) {
  const ex = EXERCISES[s.exerciseId];
  if (ex.type === 'cardio') return t('train.rx.cardio', { min: s.minutes });
  if (ex.type === 'time') return t('train.rx.time', { sets: s.sets, secs: s.secs });
  return t(ex.perSide ? 'train.rx.repsSide' : 'train.rx.reps', { sets: s.sets, reps: s.reps });
}

function weightHint(s) {
  const ex = EXERCISES[s.exerciseId];
  if (!ex.weighted) return '';
  return s.weight ? t('train.weightLast', { w: s.weight }) : t('train.weightPick', { reps: s.reps });
}

function changeText(c) {
  const to = exName(c.to);
  const from = exName(c.from);
  const n = c.next;
  switch (c.change) {
    case 'reps': return t('train.ch.reps', { ex: to, reps: n.reps });
    case 'weight': return t('train.ch.weight', { ex: to, w: n.weight, reps: n.reps });
    case 'harder': return t('train.ch.harder', { from, to });
    case 'time': return EXERCISES[c.to].type === 'cardio' ? t('train.ch.minutes', { ex: to, min: n.minutes }) : t('train.ch.secs', { ex: to, secs: n.secs });
    case 'maxed': return t('train.ch.maxed', { ex: to });
    default: return t('train.ch.same', { ex: to });
  }
}

function exerciseCard(s, i, session) {
  const ex = EXERCISES[s.exerciseId];
  const demo = demoImages(s.exerciseId);
  const name = exName(s.exerciseId);
  return html`
    <li class="exercise" data-slot="${s.slot}">
      <div class="ex-head">
        <span class="ex-num">${i + 1}</span>
        <div class="ex-text">
          <h3>${name}</h3>
          <p class="ex-rx">${prescription(s)}${ex.type !== 'cardio' ? html`<span class="muted">${t('train.rest', { secs: s.rest })}</span>` : ''}</p>
          ${weightHint(s) ? html`<p class="hint">${weightHint(s)}</p>` : ''}
          ${isCountable(s.exerciseId) && !session ? html`<p class="cam-hint">${icon('camera', 14)}<span>${t('train.camAvailable')}</span></p>` : ''}
        </div>
        ${demo.length ? html`<figure class="demo${demo.length > 1 ? ' demo-anim' : ''}" aria-hidden="true">
          ${demo.map((src) => html`<img src="${src}" alt="" width="480" height="320" loading="lazy" decoding="async">`)}</figure>` : ''}
      </div>
      <details class="cues"><summary>${t('train.cues')}</summary>
        ${demo.length ? html`<div class="demo-large">${demo.map((src, k) => html`<img src="${src}" alt="${t('train.demoAlt', { ex: name, n: k + 1, total: demo.length })}" width="480" height="320" loading="lazy" decoding="async">`)}</div>` : ''}
        <ul>${exCues(s.exerciseId).map((c) => html`<li>${c}</li>`)}</ul></details>
      ${session ? html`<ol class="sets">${Array.from({ length: s.sets }, (_, k) => setRow(s, k, session))}</ol>` : ''}
      ${session && isCountable(s.exerciseId) ? html`<button type="button" class="btn btn-small cam-btn" data-cam>${icon('camera', 16)}<span></span></button>` : ''}
    </li>`;
}

function setRow(s, k, session) {
  const ex = EXERCISES[s.exerciseId];
  const key = `${s.slot}:${k}`;
  const saved = session.done[key];
  const done = !!saved;
  const val = (f, d) => (saved && saved[f] != null ? saved[f] : d);
  let inputs;
  if (ex.type === 'cardio') inputs = html`<label class="set-in"><input type="number" inputmode="numeric" min="0" max="300" name="minutes" value="${val('minutes', s.minutes)}"><em>${t('unit.min')}</em></label>`;
  else if (ex.type === 'time') inputs = html`<label class="set-in"><input type="number" inputmode="numeric" min="0" max="3600" name="secs" value="${val('secs', s.secs)}"><em>${t('unit.sec')}</em></label>`;
  else inputs = html`<label class="set-in"><input type="number" inputmode="numeric" min="0" max="200" name="reps" value="${val('reps', s.reps)}"><em>${t('unit.reps')}</em></label>
    ${ex.weighted ? html`<label class="set-in"><input type="number" inputmode="decimal" min="0" max="500" step="0.5" name="weight" value="${val('weight', s.weight ?? '')}" placeholder="kg"><em>kg</em></label>` : ''}`;
  return html`<li class="set${done ? ' set-done' : ''}" data-key="${key}" data-rest="${s.rest}">
    <span class="set-label">${t('train.set', { n: k + 1 })}</span>
    ${inputs}
    <button type="button" class="set-check" data-done aria-pressed="${done}" aria-label="${t('train.markDone', { n: k + 1 })}">${icon('check', 18)}</button>
  </li>`;
}

function loadSession(date) {
  try { return JSON.parse(localStorage.getItem(DRAFT(date)) || 'null'); } catch { return null; }
}
function saveSession(date, s) {
  try { localStorage.setItem(DRAFT(date), JSON.stringify(s)); } catch { /* ignore */ }
}
function clearSession(date) {
  try { localStorage.removeItem(DRAFT(date)); } catch { /* ignore */ }
}

function startRest(secs) {
  stopRest();
  if (!secs) return;
  let left = secs;
  const bar = document.createElement('div');
  bar.className = 'rest-bar';
  bar.setAttribute('role', 'timer');
  bar.innerHTML = String(html`${icon('clock')}<span data-left></span><button type="button">${t('train.skipRest')}</button>`);
  document.body.append(bar);
  document.body.classList.add('resting');
  const label = bar.querySelector('[data-left]');
  const tick = () => {
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, '0');
    label.textContent = t('train.resting', { time: `${m}:${s}` });
    if (left <= 0) {
      navigator.vibrate?.(200);
      label.textContent = t('train.restOver');
      clearInterval(restTimer);
      restTimer = null;
      setTimeout(() => { bar.remove(); document.body.classList.remove('resting'); }, 2500);
    }
    left--;
  };
  tick();
  restTimer = setInterval(tick, 1000);
  bar.querySelector('button').onclick = stopRest;
}

function stopRest() {
  clearInterval(restTimer);
  restTimer = null;
  document.querySelectorAll('.rest-bar').forEach((b) => b.remove());
  document.body.classList.remove('resting');
}

export async function render(root, params, alive) {
  stopRest();
  const date = today();
  const asWeekday = params[0] !== undefined && /^[0-6]$/.test(params[0]) ? Number(params[0]) : null;
  const q = asWeekday !== null ? `&weekday=${asWeekday}` : '';
  const [w, hist] = await Promise.all([get(`/workout?date=${date}${q}`), get('/workouts')]);
  if (!alive()) return;
  const monday = addDays(date, -weekday(date));
  const doneDates = new Set(hist.workouts.map((x) => x.date));
  let session = loadSession(date);
  const day = w.day;
  const latest = hist.workouts[0];
  // planned days earlier this week that were not done (only these can be made up)
  const missed = Object.keys(w.week).map(Number).filter((wd) => wd < weekday(date) && !doneDates.has(addDays(monday, wd)));

  const view = () => html`
    <section class="page train">
      <header class="page-head"><h1>${t('train.title')}</h1><span class="page-date">${fmtDate(date, 'long')}</span></header>
      <ol class="week-strip">
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const d = addDays(monday, i);
          const plan = w.week[i];
          return html`<li class="${d === date ? 'is-today' : ''} ${plan ? 'is-planned' : ''} ${doneDates.has(d) ? 'is-done' : ''}">
            <span>${weekdayShort(i)}</span>
            <b>${doneDates.has(d) ? html`${icon('check', 16)}<span class="sr-only">${t('train.stripDone')}</span>` : plan ? html`<span aria-hidden="true">${t(`day.short.${plan.key}`)}</span><span class="sr-only">${t(`day.${plan.key}`)}</span>` : ''}</b>
          </li>`;
        })}
      </ol>
      ${w.notes.includes('injury') ? html`<div class="notice"><p>${t('train.injuryNote')}</p></div>` : ''}
      ${w.notes.includes('noDays') ? html`<div class="notice"><p>${t('train.noDays')}</p></div>` : ''}

      ${w.log ? html`
        <section class="block">
          <header class="block-head"><h2>${t('train.doneTitle', { day: t(`day.${w.log.key}`) })}</h2></header>
          <ul class="changes">${w.log.changes.map((c) => html`<li>${changeText(c)}</li>`)}</ul>
          ${latest?.date === date ? html`<button class="btn-link" type="button" data-undo>${icon('undo', 16)} ${t('train.undo')}</button>` : ''}
        </section>`
      : day ? html`
        <section class="block">
          <header class="block-head">
            <h2>${t(`day.${day.key}`)}${asWeekday !== null ? html` <small class="muted">${t('train.makeup', { day: weekdayShort(asWeekday) })}</small>` : ''}</h2>
            <span class="muted">${t('train.about', { min: day.minutes })}</span>
          </header>
          <p class="hint">${t('train.warmup')}</p>
          <ol class="exercises">${day.slots.map((s, i) => exerciseCard(s, i, session))}</ol>
          ${day.slots.some((s) => demoImages(s.exerciseId).length) ? html`<p class="fineprint">${t('train.demoCredit')}</p>` : ''}
          ${session ? html`<button class="btn btn-primary btn-block" type="button" data-finish>${t('train.finish')}</button>
            <button class="btn-link" type="button" data-cancel>${t('train.cancelSession')}</button>`
          : html`<button class="btn btn-primary btn-block" type="button" data-start>${t('train.start')}</button>`}
        </section>`
      : html`
        <section class="block">
          <header class="block-head"><h2>${t('train.restTitle')}</h2></header>
          <p>${t('train.restBody')}</p>
          ${missed.length ? html`<p class="muted">${t('train.makeupLead')}</p>
            <div class="chip-row">${missed.map((wd) => html`<a class="btn btn-small" href="#/train/${wd}">${weekdayShort(wd)} ${t(`day.short.${w.week[wd].key}`)}</a>`)}</div>` : ''}
        </section>`}

      ${hist.workouts.length ? html`
        <section class="block">
          <header class="block-head"><h2>${t('train.history')}</h2></header>
          <ul class="plain-list">${hist.workouts.slice(0, 10).map((x) => html`<li><b>${fmtDate(x.date, 'short')}</b><span>${t(`day.${x.key}`)}</span><small>${t('train.histSets', { n: x.sets.reduce((s, e) => s + e.done.length, 0) })}</small></li>`)}</ul>
        </section>` : ''}
    </section>`;

  // the camera button always targets the first set that isn't done yet
  const refreshCam = () => {
    for (const btn of $$('[data-cam]', root)) {
      const sets = $$('.set', btn.closest('.exercise'));
      const next = sets.findIndex((li) => !li.classList.contains('set-done'));
      btn.hidden = next < 0;
      if (next >= 0) btn.querySelector('span').textContent = t('train.camCount', { n: next + 1 });
    }
  };
  const draw = () => {
    mount(root, view());
    refreshCam();
  };
  draw();

  on(root, 'click', '[data-start]', () => {
    session = { done: {}, weekday: asWeekday };
    saveSession(date, session);
    draw();
    $('.exercise', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  on(root, 'click', '[data-cancel]', () => {
    clearSession(date);
    session = null;
    stopRest();
    draw();
  });
  const markDone = (li) => {
    const rec = {};
    $$('input', li).forEach((inp) => { if (inp.value !== '') rec[inp.name] = Number(inp.value); });
    session.done[li.dataset.key] = rec;
    li.classList.add('set-done');
    li.querySelector('[data-done]').setAttribute('aria-pressed', 'true');
    saveSession(date, session);
    refreshCam();
    startRest(Number(li.dataset.rest));
  };
  on(root, 'click', '[data-done]', (e, b) => {
    const li = b.closest('.set');
    const key = li.dataset.key;
    if (session.done[key]) {
      delete session.done[key];
      li.classList.remove('set-done');
      b.setAttribute('aria-pressed', 'false');
      saveSession(date, session);
      refreshCam();
    } else {
      markDone(li);
    }
  });
  on(root, 'click', '[data-cam]', (e, b) => {
    const exLi = b.closest('.exercise');
    const li = $$('.set', exLi).find((x) => !x.classList.contains('set-done'));
    if (!li) return;
    const slot = day.slots.find((x) => x.slot === exLi.dataset.slot);
    const repsInput = li.querySelector('input[name=reps]');
    stopRest();
    openCounter({
      exerciseId: slot.exerciseId,
      target: Number(repsInput?.value) || slot.reps,
      onDone: (count) => {
        if (repsInput) repsInput.value = String(count);
        markDone(li);
        toast(t('train.camSaved', { n: count }));
      },
    });
  });
  on(root, 'change', '.set input', (e, inp) => {
    const li = inp.closest('.set');
    const rec = session?.done[li.dataset.key];
    if (rec) { rec[inp.name] = inp.value === '' ? null : Number(inp.value); saveSession(date, session); }
  });
  on(root, 'click', '[data-finish]', async (e, b) => {
    const sets = Object.entries(session.done).map(([key, rec]) => {
      const slot = key.split(':')[0];
      const out = { slot };
      for (const [k, v] of Object.entries(rec)) if (v !== null && v !== undefined && !Number.isNaN(v)) out[k] = v;
      return out;
    });
    if (!sets.length) return toast(t('train.needOneSet'));
    b.disabled = true;
    try {
      await post('/workout', { date, sets, weekday: asWeekday });
      clearSession(date);
      stopRest();
      toast(t('train.saved'));
      route();
    } catch (err) {
      b.disabled = false;
      toast(t(`err.${err.code}`, {}, t('err.generic')));
    }
  });
  on(root, 'click', '[data-undo]', async () => {
    await del(`/workout/${date}`);
    toast(t('train.undone'));
    route();
  });
}
