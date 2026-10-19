import { html, mount, on, $, toast, icon } from '../ui.js';
import { t, fmtNum, fmtDate } from '../i18n.js';
import { get, post, del } from '../api.js';
import { state, today, refreshMe, route } from '../app.js';
import { addDays } from '../core/dates.js';
import { kgToDisplay, displayToKg, weightUnit, cmToDisplay, lengthUnit } from '../units.js';
import { weightChart } from '../charts.js';

let range = 90;

export async function render(root, params, alive) {
  const [{ weights }, dash] = await Promise.all([get('/weights'), get(`/dashboard?today=${today()}`)]);
  if (!alive()) return;
  const units = state.user.units;
  const wu = t(`unit.${weightUnit(units)}`);
  const lu = lengthUnit(units);
  const w = dash.weight;
  const goal = dash.plan.goalKg;
  const from = range ? addDays(today(), -range + 1) : '0000';
  const shown = weights.filter((p) => p.date >= from).map((p) => ({ date: p.date, kg: kgToDisplay(p.kg, units), avg: kgToDisplay(p.avg, units) }));
  const lost = w.trend !== null ? dash.plan.startKg - w.trend : null;
  const waist = dash.body.waist;

  mount(root, html`
    <section class="page weight">
      <header class="page-head"><h1>${t('weight.title')}</h1></header>
      <div class="sheet stat-row">
        <div><small>${t('weight.trend')}</small><b>${w.trend !== null ? fmtNum(kgToDisplay(w.trend, units), 1) : '—'}</b><span>${wu}</span></div>
        <div><small>${t('weight.change')}</small><b>${lost !== null ? `${lost >= 0 ? '−' : '+'}${fmtNum(Math.abs(kgToDisplay(lost, units)), 1)}` : '—'}</b><span>${t('weight.sinceStart')}</span></div>
        <div><small>${t('weight.goal')}</small><b>${fmtNum(kgToDisplay(goal, units), 1)}</b><span>${w.projectedEnd ? fmtDate(w.projectedEnd, 'short') : wu}</span></div>
      </div>

      <section class="block">
        <header class="block-head"><h2>${t('weight.chartTitle')}</h2>
          <div class="segmented segmented-small" role="group" aria-label="${t('weight.range')}">
            ${[[30, '30'], [90, '90'], [0, 'all']].map(([v, k]) => html`<button type="button" data-range="${v}" aria-pressed="${range === v}">${t(`weight.range.${k}`)}</button>`)}
          </div>
        </header>
        <div class="chart-box" data-chart></div>
        <p class="hint">${t('weight.whyTrend')}</p>
        ${dash.body.bands.length ? html`<p class="hint">${t('weight.bandHint')}</p>` : ''}
        ${waist?.latest ? html`<p class="waist-line"><span>${t('weight.waistLine', { v: fmtNum(cmToDisplay(waist.latest.cm, units), 1), unit: lu, date: fmtDate(waist.latest.date, 'short') })}</span>
          ${waist.recent ? html`<span class="muted">${t('weight.waistRecent', { weeks: waist.recent.weeks, v: `${waist.recent.cm > 0 ? '+' : waist.recent.cm < 0 ? '−' : '±'}${fmtNum(cmToDisplay(Math.abs(waist.recent.cm), units), 1)}`, unit: lu })}</span>` : ''}
          <a href="#/body">${t('today.bodyLink')}</a></p>` : ''}
      </section>

      ${w.needsRecalc ? html`<div class="notice notice-info"><p>${t('today.recalc', { diff: fmtNum(Math.abs(kgToDisplay(w.trend, units) - kgToDisplay(dash.targets.basedOnKg, units)), 1), unit: wu })}</p>
        <button class="btn btn-small" type="button" data-recalc>${t('today.recalcBtn')}</button></div>` : ''}
      ${w.plateau ? html`<div class="notice"><p><b>${t('today.plateauTitle')}</b></p><p>${t('today.plateau')}</p></div>` : ''}
      ${w.waistDown ? html`<div class="notice notice-good"><p><b>${t('today.waistDownTitle')}</b></p>
        <p>${t('today.waistDown', { weeks: w.waistDown.weeks, v: fmtNum(cmToDisplay(w.waistDown.cm, units), 1), unit: lu })}</p></div>` : ''}
      ${w.cycleWater ? html`<div class="notice"><p>${t('today.cycleWater')}</p></div>` : ''}

      <section class="block">
        <header class="block-head"><h2>${t('weight.log')}</h2></header>
        <form class="stack" data-log novalidate>
          <div class="field-row">
            <label class="field"><span>${t('weight.date')}</span><input name="date" type="date" max="${today()}" value="${today()}"></label>
            <label class="field"><span>${t('weight.weight')}</span><div class="input-unit"><input name="kg" type="number" inputmode="decimal" step="0.1" required><em>${wu}</em></div></label>
          </div>
          <button class="btn btn-primary" type="submit">${t('common.save')}</button>
        </form>
        <p class="hint">${t('weight.howTo')}</p>
      </section>

      <section class="block">
        <header class="block-head"><h2>${t('weight.entries')}</h2></header>
        ${weights.length ? html`<table class="data-table">
          <thead><tr><th>${t('weight.date')}</th><th>${t('weight.weight')}</th><th>${t('weight.avg7')}</th><th><span class="sr-only">${t('common.delete')}</span></th></tr></thead>
          <tbody>${[...weights].reverse().slice(0, 60).map((p) => html`<tr>
            <td>${fmtDate(p.date, 'short')}</td>
            <td>${fmtNum(kgToDisplay(p.kg, units), 1)}</td>
            <td class="muted">${fmtNum(kgToDisplay(p.avg, units), 1)}</td>
            <td><button class="icon-btn" type="button" data-del="${p.date}" aria-label="${t('weight.deleteEntry', { date: fmtDate(p.date, 'short') })}">${icon('trash', 16)}</button></td>
          </tr>`)}</tbody></table>` : html`<p class="muted">${t('weight.empty')}</p>`}
      </section>
    </section>`);

  weightChart($('[data-chart]', root), shown, {
    goal: kgToDisplay(goal, units),
    unit: wu,
    fmtDate: (d) => fmtDate(d, 'short'),
    bands: dash.body.bands,
    labels: {
      aria: t('weight.chartAria'), day: t('weight.daily'), avg: t('weight.avg7'), goal: t('weight.goalLine'),
      goalShort: t('weight.goalShort', { v: fmtNum(kgToDisplay(goal, units), 1) }),
      goalBelow: t('weight.goalBelow', { v: fmtNum(kgToDisplay(goal, units), 1), unit: wu }),
      empty: t('weight.empty'), table: t('weight.chartAria'), date: t('weight.date'), band: t('cycle.band'),
    },
  });

  const reload = () => route();
  on(root, 'click', '[data-range]', (e, b) => { range = Number(b.dataset.range); reload(); });
  on(root, 'click', '[data-del]', async (e, b) => {
    await del(`/weights/${b.dataset.del}`);
    toast(t('weight.deleted'));
    reload();
  });
  on(root, 'click', '[data-recalc]', async () => {
    await post('/plan/recalc', { today: today() });
    await refreshMe();
    toast(t('today.recalcDone'));
    reload();
  });
  const form = $('[data-log]', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kg = displayToKg(form.kg.value, units);
    if (!(kg >= 30 && kg <= 300)) return toast(t('err.bad_weight'));
    try {
      await post('/weights', { date: form.date.value, kg });
      toast(t('common.saved'));
      reload();
    } catch (err) {
      toast(t(`err.${err.code}`, {}, t('err.generic')));
    }
  });
}
