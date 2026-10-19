// Body log: optional measures beyond weight (waist, cycle, sleep quality, water).
// Each one is off until the person switches it on here.

import { html, mount, on, $, toast, icon, openSheet } from '../ui.js';
import { t, fmtNum, fmtDate } from '../i18n.js';
import { get, post, del } from '../api.js';
import { state, today, route, go } from '../app.js';
import { addDays, daysBetween } from '../core/dates.js';
import { cmToDisplay, displayToCm, lengthUnit } from '../units.js';
import { waistSummary, sleepSummary, TRACKING_ITEMS, CUP_ML } from '../core/body.js';
import { cycleStatus, sortPeriods, periodEnd, periodBands } from '../core/cycle.js';
import { weightChart, barChart } from '../charts.js';
import { cycleHeadline, cycleActions, bindCycleActions, waterControl, bindWater, saveTracking } from './shared.js';

function days14(rows, end) {
  const by = new Map(rows.map((r) => [r.date, r]));
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(end, i - 13);
    return { date, row: by.get(date) || null };
  });
}

const dayNum = (date, isLast) => (isLast ? t('common.today') : String(Number(date.slice(8))));

function togglesBlock(tr) {
  return html`
    <section class="block">
      <header class="block-head"><h2>${t('body.what')}</h2></header>
      <ul class="toggles">
        ${TRACKING_ITEMS.map((k) => html`<li>
          <label class="toggle">
            <b>${t(`body.item.${k}`)}</b>
            <input type="checkbox" role="switch" name="${k}" data-track="${k}" ${tr[k] ? 'checked' : ''}>
            <small>${t(`body.item.${k}.why`)}</small>
          </label>
        </li>`)}
      </ul>
    </section>`;
}

function waistBlock(d, units) {
  const lu = lengthUnit(units);
  const sum = waistSummary(d.waists, d.heightCm, d.today);
  const fmtLen = (cm, digits = 1) => fmtNum(cmToDisplay(cm, units), digits);
  const signed = (cm) => `${cm > 0 ? '+' : cm < 0 ? '−' : '±'}${fmtLen(Math.abs(cm))}`;
  return html`
    <section class="block" id="waist">
      <header class="block-head"><h2>${t('body.item.waist')}</h2>
        ${sum.latest ? html`<span class="muted">${t('body.waist.last', { date: fmtDate(sum.latest.date, 'short') })}</span>` : ''}</header>
      ${sum.latest ? html`
        <div class="sheet stat-row">
          <div><small>${t('body.waist.latest')}</small><b>${fmtLen(sum.latest.cm)}</b><span>${lu}</span></div>
          <div><small>${sum.recent ? t('body.waist.weeks', { n: sum.recent.weeks }) : t('body.waist.change')}</small>
            <b>${sum.recent ? signed(sum.recent.cm) : sum.sinceFirst ? signed(sum.sinceFirst.cm) : '—'}</b><span>${lu}</span></div>
          <div><small>${t('body.waist.ratio')}</small><b>${sum.ratio !== null ? fmtNum(sum.ratio, 2) : '—'}</b><span>${t('body.waist.ratioGoal')}</span></div>
        </div>
        ${sum.band ? html`<p>${t(`body.waist.band.${sum.band}`, { r: fmtNum(sum.ratio, 2), v: fmtLen(sum.healthyBelowCm), unit: lu })}</p>` : ''}
        ${sum.count >= 2 ? html`<div class="chart-box" data-waist-chart></div>` : ''}`
      : html`<p class="muted">${t('body.waist.empty')}</p>`}
      <form class="stack" data-waist novalidate>
        <div class="field-row">
          <label class="field"><span>${t('weight.date')}</span><input name="date" type="date" max="${d.today}" value="${d.today}"></label>
          <label class="field"><span>${t('body.item.waist')}</span><div class="input-unit"><input name="cm" type="number" inputmode="decimal" step="0.5"><em>${lu}</em></div></label>
        </div>
        <button class="btn" type="submit">${t('common.save')}</button>
      </form>
      <details><summary>${t('body.waist.howTitle')}</summary><p class="hint">${t('body.waist.how')}</p></details>
      ${sum.latest ? html`<details><summary>${t('body.entries', { n: d.waists.length })}</summary>
        <table class="data-table"><tbody>${[...d.waists].reverse().map((w) => html`<tr>
          <td>${fmtDate(w.date, 'short')}</td><td>${fmtLen(w.cm)} ${lu}</td>
          <td><button class="icon-btn" type="button" data-del-waist="${w.date}" aria-label="${t('weight.deleteEntry', { date: fmtDate(w.date, 'short') })}">${icon('trash', 16)}</button></td>
        </tr>`)}</tbody></table></details>` : ''}
      <p class="fineprint">${t('body.waist.source')}</p>
    </section>`;
}

function cycleBlock(d, tr) {
  const c = cycleStatus(d.periods, d.today, tr.cycleKind);
  const sorted = sortPeriods(d.periods).reverse();
  const head = cycleHeadline(c);
  const about = !c.hasData ? null : c.kind === 'hormonal' ? 'hormonal' : c.phase;
  return html`
    <section class="block" id="cycle">
      <header class="block-head"><h2>${t('body.item.cycle')}</h2></header>
      <div class="cycle-now">
        <p><b>${head.title}</b>${head.detail ? html`<span>${head.detail}</span>` : ''}</p>
        ${about ? html`<p class="hint">${t(`cycle.about.${about}`)}</p>` : ''}
        ${c.predicted && !c.known ? html`<p class="hint">${t('cycle.unknownLength')}</p>` : ''}
        ${c.predicted && c.irregular ? html`<p class="hint">${t('cycle.irregular')}</p>` : ''}
        ${cycleActions(c)}
      </div>
      <details>
        <summary>${t('cycle.addPast')}</summary>
        <form class="stack" data-period-past novalidate>
          <div class="field-row">
            <label class="field"><span>${t('cycle.start')}</span><input name="start" type="date" max="${d.today}" required></label>
            <label class="field"><span>${t('cycle.end')}</span><input name="end" type="date" max="${d.today}"></label>
          </div>
          <button class="btn" type="submit">${t('common.save')}</button>
        </form>
      </details>
      ${sorted.length ? html`<table class="data-table">
        <thead><tr><th>${t('cycle.start')}</th><th>${t('cycle.days')}</th><th>${t('cycle.length')}</th><th><span class="sr-only">${t('common.delete')}</span></th></tr></thead>
        <tbody>${sorted.slice(0, 12).map((p, i) => {
          const prev = sorted[i + 1];
          const end = periodEnd(p, d.today);
          return html`<tr>
            <td>${fmtDate(p.start, 'short')}</td>
            <td>${p.end || end < d.today ? t('cycle.nDays', { n: daysBetween(p.start, end) + 1 }) : t('cycle.ongoing')}</td>
            <td class="muted">${prev ? t('cycle.nDays', { n: daysBetween(prev.start, p.start) }) : ''}</td>
            <td><button class="icon-btn" type="button" data-del-period="${p.start}" aria-label="${t('cycle.deleteEntry', { date: fmtDate(p.start, 'short') })}">${icon('trash', 16)}</button></td>
          </tr>`;
        })}</tbody></table>` : ''}
      <fieldset class="group">
        <legend>${t('cycle.kind')}</legend>
        <div class="segmented">
          ${['natural', 'hormonal'].map((k) => html`<label><input type="radio" name="cycleKind" value="${k}" ${tr.cycleKind === k ? 'checked' : ''}><span>${t(`cycle.kind.${k}`)}</span></label>`)}
        </div>
        <small class="muted">${t('cycle.kind.hint')}</small>
      </fieldset>
      <p class="fineprint">${t('cycle.privacy')}</p>
      ${sorted.length ? html`<button class="btn btn-small btn-danger btn-start" type="button" data-clear-periods>${t('cycle.clear')}</button>` : ''}
    </section>`;
}

function sleepBlock(d, tr) {
  const target = d.sleepTarget.hours;
  const week = d.daily.filter((r) => r.date > addDays(d.today, -7));
  const sum = sleepSummary(week, target);
  return html`
    <section class="block" id="sleep">
      <header class="block-head"><h2>${t('body.sleep.title')}</h2><span class="muted">${t('body.sleep.plan', { h: target })}</span></header>
      ${sum ? html`<p>${sum.short ? t('body.sleep.summaryShort', { n: sum.nights, avg: fmtNum(sum.avg, 1), short: sum.short, h: target })
        : t('body.sleep.summaryGood', { n: sum.nights, avg: fmtNum(sum.avg, 1) })}</p>`
      : html`<p class="muted">${t('body.sleep.empty')}</p>`}
      ${d.daily.some((r) => r.sleepHours != null) ? html`<div class="chart-box" data-sleep-chart></div>` : ''}
      ${d.daily.some((r) => r.sleepHours != null) ? html`<div class="chart-legend">
        <span><i class="key key-bar"></i>${t('sleepq.3')}</span>
        <span><i class="key key-bar key-soft"></i>${t('sleepq.2')}</span>
        <span><i class="key key-bar key-warn"></i>${t('sleepq.1')}</span>
      </div>` : ''}
      <p class="hint">${t('body.sleep.why')}</p>
      <p class="hint">${t('body.sleep.where')}</p>
    </section>`;
}

function waterBlock(d) {
  const todayRow = d.daily.find((r) => r.date === d.today);
  return html`
    <section class="block" id="water">
      <header class="block-head"><h2>${t('body.item.water')}</h2></header>
      ${waterControl(todayRow?.waterMl ?? 0, d.water)}
      ${d.daily.some((r) => r.waterMl != null) ? html`<div class="chart-box" data-water-chart></div>` : ''}
      <p class="hint">${t('body.water.ref', { cups: d.water.cups, l: fmtNum(d.water.ml / 1000, 2) })}</p>
      <p class="hint">${t('body.water.tip')}</p>
    </section>`;
}

export async function render(root, params, alive) {
  const d = await get(`/body?today=${today()}`);
  if (!alive()) return;
  if (d.needsOnboarding) return go('onboarding');
  const units = state.user.units;
  const tr = d.tracking;
  const any = TRACKING_ITEMS.some((k) => tr[k]);

  mount(root, html`
    <section class="page body-log">
      <header class="page-head"><h1>${t('body.title')}</h1></header>
      <p class="lead">${t('body.lead')}</p>
      ${togglesBlock(tr)}
      ${tr.waist ? waistBlock(d, units) : ''}
      ${tr.cycle ? cycleBlock(d, tr) : ''}
      ${tr.sleepQuality ? sleepBlock(d, tr) : ''}
      ${tr.water ? waterBlock(d) : ''}
      ${any ? '' : html`<p class="muted center">${t('body.noneOn')}</p>`}
    </section>`);

  // charts
  const waistBox = $('[data-waist-chart]', root);
  if (waistBox) {
    const sum = waistSummary(d.waists, d.heightCm, d.today);
    const pts = d.waists.map((w) => ({ date: w.date, kg: cmToDisplay(w.cm, units), avg: cmToDisplay(w.cm, units) }));
    const goal = cmToDisplay(sum.healthyBelowCm, units);
    weightChart(waistBox, pts, {
      single: true,
      goal,
      unit: lengthUnit(units),
      fmtDate: (x) => fmtDate(x, 'short'),
      bands: tr.cycle ? periodBands(d.periods, d.today) : [],
      labels: {
        aria: t('body.waist.chartAria'), day: t('body.item.waist'), avg: '', goal: t('body.waist.goalLine'),
        goalShort: fmtNum(goal, 1), goalBelow: '', empty: t('body.waist.empty'), table: t('body.waist.chartAria'),
        date: t('weight.date'), band: t('cycle.band'),
      },
    });
  }
  const sleepBox = $('[data-sleep-chart]', root);
  if (sleepBox) {
    barChart(sleepBox, days14(d.daily, d.today).map(({ date, row }) => ({
      date,
      value: row?.sleepHours ?? null,
      tone: row?.sleepQuality === 1 ? 'warn' : row?.sleepQuality === 2 ? 'soft' : '',
    })), {
      target: d.sleepTarget.hours,
      fmt: (v, item) => `${t('body.sleep.hours', { h: fmtNum(v, 1) })}${item?.tone === 'warn' ? ` · ${t('sleepq.1')}` : item?.tone === 'soft' ? ` · ${t('sleepq.2')}` : ''}`,
      dayLabel: dayNum,
      fmtDate: (x) => fmtDate(x, 'long'),
      labels: { aria: t('body.sleep.chartAria'), target: t('body.sleep.hours', { h: d.sleepTarget.hours }), none: t('body.notLogged') },
    });
  }
  const waterBox = $('[data-water-chart]', root);
  if (waterBox) {
    barChart(waterBox, days14(d.daily, d.today).map(({ date, row }) => ({
      date,
      value: row?.waterMl != null ? row.waterMl / CUP_ML : null,
      tone: row?.waterMl != null && row.waterMl < d.water.ml / 2 ? 'soft' : '',
    })), {
      target: d.water.cups,
      fmt: (v) => t('water.cupsN', { n: fmtNum(v, v % 1 ? 1 : 0) }),
      dayLabel: dayNum,
      fmtDate: (x) => fmtDate(x, 'long'),
      labels: { aria: t('body.water.chartAria'), target: t('water.cupsN', { n: d.water.cups }), none: t('body.notLogged') },
    });
  }

  const reload = () => route();
  on(root, 'change', '[data-track]', async (e, el) => {
    el.disabled = true;
    try {
      await saveTracking({ [el.dataset.track]: el.checked });
      reload();
    } catch (err) {
      el.disabled = false;
      el.checked = !el.checked;
      toast(t(`err.${err.code}`, {}, t('err.generic')));
    }
  });
  on(root, 'change', '[name=cycleKind]', async (e, el) => {
    await saveTracking({ cycleKind: el.value });
    toast(t('common.saved'));
    reload();
  });

  const waistForm = $('[data-waist]', root);
  waistForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cm = displayToCm(waistForm.cm.value, units);
    if (waistForm.cm.value === '' || !(cm >= 40 && cm <= 250)) return toast(t('err.bad_waist'));
    try {
      await post('/waist', { date: waistForm.date.value || today(), cm });
      toast(t('common.saved'));
      reload();
    } catch (err) {
      toast(t(`err.${err.code}`, {}, t('err.generic')));
    }
  });
  on(root, 'click', '[data-del-waist]', async (e, b) => {
    await del(`/waist/${b.dataset.delWaist}`);
    toast(t('weight.deleted'));
    reload();
  });

  bindCycleActions(root, reload);
  const past = $('[data-period-past]', root);
  past?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!past.start.value) return toast(t('err.bad_start'));
    try {
      await post('/periods', { today: today(), start: past.start.value, end: past.end.value || null });
      toast(t('common.saved'));
      reload();
    } catch (err) {
      toast(t(`err.${err.code}`, {}, t('err.generic')));
    }
  });
  on(root, 'click', '[data-del-period]', async (e, b) => {
    await del(`/periods/${b.dataset.delPeriod}`);
    toast(t('weight.deleted'));
    reload();
  });
  on(root, 'click', '[data-clear-periods]', () => {
    openSheet({
      title: t('cycle.clear'),
      closeLabel: t('common.close'),
      content: html`<div class="stack"><p>${t('cycle.clearBody')}</p>
        <button class="btn btn-danger btn-block" type="button" data-confirm>${t('cycle.clearConfirm')}</button></div>`,
      onMount(body, close) {
        $('[data-confirm]', body).onclick = async () => {
          await del('/periods');
          close();
          toast(t('cycle.cleared'));
          reload();
        };
      },
    });
  });

  bindWater(root, today());
}
