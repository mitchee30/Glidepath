// Hand-rolled SVG charts: weight trend (dots + 7-day line + goal) and weekly intake columns.
// Both get a hover/tap layer and a visually hidden data table for screen readers.

import { html, raw, esc } from './ui.js';
import { daysBetween } from './core/dates.js';

const W = 360;

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || 1;
  const raw0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || mag * 10;
  const start = Math.ceil(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

function tooltipLayer(container) {
  let tip = container.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    container.append(tip);
  }
  return tip;
}

/**
 * points: [{date, kg, avg}] in display units, sorted by date.
 * opts: { goal, unit, fmtDate(date), labels: { day, avg, goal, empty, table } }
 */
export function weightChart(container, points, opts) {
  const H = 210;
  const pad = { l: 36, r: 44, t: 14, b: 26 };
  if (!points.length) {
    container.innerHTML = String(html`<p class="chart-empty">${opts.labels.empty}</p>`);
    return;
  }
  const first = points[0].date;
  const last = points[points.length - 1].date;
  const spanDays = Math.max(1, daysBetween(first, last));
  const vals = points.flatMap((p) => [p.kg, p.avg]);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const range = Math.max(hi - lo, 1);
  const showGoal = Number.isFinite(opts.goal) && opts.goal >= lo - range * 0.6;
  if (showGoal) lo = Math.min(lo, opts.goal);
  lo -= range * 0.15;
  hi += range * 0.15;
  const x = (d) => pad.l + (daysBetween(first, d) / spanDays) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = niceTicks(lo, hi, 5);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)}`).join('');
  const lastP = points[points.length - 1];
  const midDate = points[Math.floor(points.length / 2)].date;

  container.innerHTML = String(html`
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.labels.aria}">
      ${ticks.map((v) => raw(`<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>
        <text class="tick" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(String(v))}</text>`))}
      ${raw(`<text class="tick" x="${pad.l}" y="${H - 6}">${esc(opts.fmtDate(first))}</text>`)}
      ${spanDays > 20 ? raw(`<text class="tick" x="${x(midDate)}" y="${H - 6}" text-anchor="middle">${esc(opts.fmtDate(midDate))}</text>`) : ''}
      ${raw(`<text class="tick" x="${W - pad.r}" y="${H - 6}" text-anchor="end">${esc(opts.fmtDate(last))}</text>`)}
      ${showGoal ? raw(`<line class="goal-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(opts.goal)}" y2="${y(opts.goal)}"/>
        <text class="goal-label" x="${W - pad.r + 4}" y="${y(opts.goal) + 4}">${esc(opts.labels.goalShort)}</text>`) : ''}
      ${points.map((p) => raw(`<circle class="dot-day" cx="${x(p.date)}" cy="${y(p.kg)}" r="4"/>`))}
      ${raw(`<path class="trend-line" d="${line}"/>`)}
      ${raw(`<circle class="dot-end" cx="${x(lastP.date)}" cy="${y(lastP.avg)}" r="5"/>
        <text class="end-label" x="${x(lastP.date) + 8}" y="${y(lastP.avg) + 4}">${esc(lastP.avg.toFixed(1))}</text>`)}
      <line class="crosshair" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
      <rect class="hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}" fill="transparent"/>
    </svg>
    <div class="chart-legend">
      <span><i class="key key-dot"></i>${opts.labels.day}</span>
      <span><i class="key key-line"></i>${opts.labels.avg}</span>
      ${showGoal ? html`<span><i class="key key-goal"></i>${opts.labels.goal}</span>` : html`<span class="muted">${opts.labels.goalBelow}</span>`}
    </div>
    <table class="sr-only"><caption>${opts.labels.table}</caption>
      <tr><th>${opts.labels.date}</th><th>${opts.labels.day}</th><th>${opts.labels.avg}</th></tr>
      ${points.map((p) => html`<tr><td>${p.date}</td><td>${p.kg}</td><td>${p.avg.toFixed(1)}</td></tr>`)}
    </table>`);

  const svg = container.querySelector('svg');
  const cross = svg.querySelector('.crosshair');
  const tip = tooltipLayer(container);
  const move = (e) => {
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(x(p.date) - sx) < Math.abs(x(best.date) - sx)) best = p;
    const px = x(best.date);
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = String(html`<b>${opts.fmtDate(best.date)}</b><span>${opts.labels.day} ${best.kg} ${opts.unit}</span><span>${opts.labels.avg} ${best.avg.toFixed(1)} ${opts.unit}</span>`);
    const left = (px / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(left, 70), rect.width - 70)}px`;
    tip.style.top = `${(y(best.kg) / H) * rect.height - 8}px`;
  };
  const leave = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const hit = svg.querySelector('.hit');
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
}

/**
 * week: [{date, kcal, count}] (7 days, last = today). target: kcal.
 */
export function weekBars(container, week, target, opts) {
  const H = 150;
  const pad = { l: 8, r: 8, t: 18, b: 24 };
  const max = Math.max(target * 1.25, ...week.map((d) => d.kcal), 1);
  const slot = (W - pad.l - pad.r) / week.length;
  const bw = Math.min(24, slot * 0.55);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const base = H - pad.b;
  const barPath = (cx, top) => {
    const h = base - top;
    if (h <= 0) return '';
    const r = Math.min(4, h, bw / 2);
    const l = cx - bw / 2;
    return `M${l},${base}V${top + r}Q${l},${top} ${l + r},${top}H${l + bw - r}Q${l + bw},${top} ${l + bw},${top + r}V${base}Z`;
  };
  container.innerHTML = String(html`
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.labels.aria}">
      ${raw(`<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${base}" y2="${base}"/>`)}
      ${week.map((d, i) => {
        const cx = pad.l + slot * (i + 0.5);
        const today = i === week.length - 1;
        return raw(`<path class="bar${today ? ' bar-today' : ''}${d.count ? '' : ' bar-empty'}" d="${barPath(cx, y(d.kcal))}"/>
          <text class="tick" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(opts.dayLabel(d.date, today))}</text>
          <rect class="hit" data-i="${i}" x="${cx - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent"/>`);
      })}
      ${raw(`<line class="target-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(target)}" y2="${y(target)}"/>
        <text class="tick" x="${W - pad.r}" y="${y(target) - 5}" text-anchor="end">${esc(opts.labels.target)}</text>`)}
    </svg>
    <table class="sr-only"><caption>${opts.labels.aria}</caption>
      ${week.map((d) => html`<tr><td>${d.date}</td><td>${d.kcal}</td></tr>`)}
    </table>`);
  const svg = container.querySelector('svg');
  const tip = tooltipLayer(container);
  const show = (e) => {
    const i = Number(e.target.dataset.i);
    const d = week[i];
    const rect = svg.getBoundingClientRect();
    tip.hidden = false;
    tip.innerHTML = String(html`<b>${opts.fmtDate(d.date)}</b><span>${d.count ? `${opts.fmtKcal(d.kcal)} kcal` : opts.labels.none}</span>`);
    const cx = ((pad.l + slot * (i + 0.5)) / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(cx, 60), rect.width - 60)}px`;
    tip.style.top = `${(y(d.kcal) / H) * rect.height - 8}px`;
  };
  svg.querySelectorAll('.hit').forEach((r) => {
    r.addEventListener('pointerenter', show);
    r.addEventListener('pointerdown', show);
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}
