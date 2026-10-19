import { html, icon, on, toast } from '../ui.js';
import { t, fmtNum, fmtDate } from '../i18n.js';
import { post } from '../api.js';
import { state } from '../app.js';
import { localToday } from '../core/dates.js';
import { CUP_ML, MAX_WATER_ML } from '../core/body.js';

// Help lines shown when screening or safety signals suggest someone may be struggling.
// Edit this list for the regions you serve.
export const RESOURCES = [
  { id: 'nedic', phone: '1-866-633-4220', url: 'https://nedic.ca' },
  { id: 'alliance', phone: '1-866-662-1235', url: 'https://www.allianceforeatingdisorders.com' },
];

export function helpResources() {
  return html`
    <div class="resources">
      <h2>${t('help.title')}</h2>
      <ul>
        ${RESOURCES.map((r) => html`<li>
          <b>${t(`help.${r.id}`)}</b>
          <span>${t(`help.${r.id}.where`)}</span>
          <a href="tel:${r.phone.replace(/[^0-9+]/g, '')}">${r.phone}</a>
          <a href="${r.url}" target="_blank" rel="noopener">${r.url.replace(/^https:\/\/(www\.)?/, '')}</a>
        </li>`)}
      </ul>
      <p class="hint">${t('help.emergency')}</p>
    </div>`;
}

export function signalBanner(signals) {
  if (!signals?.length) return '';
  return html`<div class="notice notice-care" role="note">
    ${icon('heart')}
    <div>
      ${signals.map((s) => html`<p>${t(`signal.${s}`)}</p>`)}
      <details><summary>${t('signal.help')}</summary>${helpResources()}</details>
    </div>
  </div>`;
}

export function demoBanner(user) {
  if (!user?.isDemo) return '';
  return html`<div class="notice notice-demo"><p>${t('demo.banner')}</p></div>`;
}

// ------------------------------------------------------- optional tracking

/** Saves a change to which optional measures are on and keeps state.user in step. */
export async function saveTracking(patch) {
  const r = await post('/tracking', patch);
  state.user = r.user;
  return r.user.tracking;
}

/** One-line summary of where someone is in their cycle. c comes from cycleStatus(). */
export function cycleHeadline(c) {
  if (!c?.hasData) return { title: t('cycle.none'), detail: '' };
  if (c.inPeriod) return { title: t('cycle.periodDay', { n: c.day }), detail: '' };
  if (!c.predicted) return { title: t('cycle.sinceLast', { n: c.day }), detail: '' };
  if (c.phase === 'late') return { title: t('cycle.dayN', { n: c.day }), detail: t('cycle.late', { n: c.lateBy }) };
  return {
    title: t('cycle.dayPhase', { n: c.day, phase: t(`cycle.phase.${c.phase}`) }),
    detail: c.daysToNext === 0 ? t('cycle.nextToday') : t('cycle.next', { date: fmtDate(c.nextStart, 'short'), n: c.daysToNext }),
  };
}

export function cycleActions(c) {
  if (c?.hasData && c.inPeriod) {
    return c.open ? html`<button class="btn btn-small" type="button" data-period-end="${c.lastStart}">${t('cycle.endToday')}</button>` : '';
  }
  return html`<button class="btn btn-small" type="button" data-period-start>${t('cycle.startToday')}</button>`;
}

export function bindCycleActions(root, onSaved) {
  const save = async (body, msg) => {
    try {
      await post('/periods', { today: localToday(), ...body });
      toast(msg);
      onSaved();
    } catch (err) {
      toast(t(`err.${err.code}`, {}, t('err.generic')));
    }
  };
  on(root, 'click', '[data-period-start]', () => save({ start: localToday() }, t('cycle.started')));
  on(root, 'click', '[data-period-end]', (e, b) => save({ start: b.dataset.periodEnd, end: localToday() }, t('cycle.ended')));
}

const cupsText = (ml) => {
  const cups = ml / CUP_ML;
  return fmtNum(cups, cups % 1 ? 1 : 0);
};

/** Today's water as a +/- counter. target: { cups, ml }. */
export function waterControl(ml, target) {
  return html`<div class="water" data-water-box data-ml="${ml}" data-goal="${target.cups}">
    <div class="water-label"><span>${t('water.today')}</span><small>${t('water.goal', { n: target.cups })}</small></div>
    <b class="water-count" data-water-count>${t('water.cupsOf', { n: cupsText(ml), goal: target.cups })}</b>
    <button class="icon-btn icon-btn-line" type="button" data-water="-1" aria-label="${t('water.minus')}" ${ml <= 0 ? 'disabled' : ''}>${icon('minus', 18)}</button>
    <button class="btn btn-small" type="button" data-water="1">${icon('plus', 16)}<span>${t('water.plus')}</span></button>
  </div>`;
}

/** Taps update the counter at once; saves go out one after another so the last tap wins. */
export function bindWater(root, date) {
  let chain = Promise.resolve();
  on(root, 'click', '[data-water]', (e, b) => {
    const box = b.closest('[data-water-box]');
    const before = Number(box.dataset.ml) || 0;
    const next = Math.min(MAX_WATER_ML, Math.max(0, before + Number(b.dataset.water) * CUP_ML));
    if (next === before) return;
    const paint = (ml) => {
      box.dataset.ml = String(ml);
      box.querySelector('[data-water-count]').textContent = t('water.cupsOf', { n: cupsText(ml), goal: box.dataset.goal });
      box.querySelector('[data-water="-1"]').disabled = ml <= 0;
    };
    paint(next);
    chain = chain.then(() => post('/daily', { date, waterMl: next })).catch((err) => {
      paint(before);
      toast(t(`err.${err.code}`, {}, t('err.generic')));
    });
  });
}

/** Breakfast / lunch / dinner / snack by local time of day. */
export function mealForNow(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return 'breakfast';
  if (h < 14.5) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 21) return 'dinner';
  return 'snack';
}
