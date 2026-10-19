import { html, mount, on, $, openSheet, toast } from '../ui.js';
import { t, fmtNum, fmtDate, getLang } from '../i18n.js';
import { post, del } from '../api.js';
import { state, go, changeLang, refreshMe } from '../app.js';
import { bmr, tdee, intakeFloor, ACTIVITY, LIMITS, KCAL_PER_KG } from '../core/plan.js';
import { kgToDisplay, weightUnit, UNIT_SYSTEMS } from '../units.js';
import { TRACKING_ITEMS } from '../core/body.js';
import { helpResources, demoBanner } from './shared.js';

function explain(profile, plan) {
  const tg = plan.targets;
  const w = tg.basedOnKg;
  const p = { ...profile, weightKg: w };
  const units = state.user.units;
  const wu = t(`unit.${weightUnit(units)}`);
  const weekly = ((tg.tdee - tg.calories) * 7) / KCAL_PER_KG;
  return html`
    <ol class="explain">
      <li><b>${t('me.ex.bmr', { n: fmtNum(Math.round(bmr(p))) })}</b><span>${t('me.ex.bmrBody', { w: fmtNum(kgToDisplay(w, units), 1), unit: wu })}</span></li>
      <li><b>${t('me.ex.tdee', { n: fmtNum(Math.round(tdee(p) / 10) * 10) })}</b><span>${t('me.ex.tdeeBody', { f: ACTIVITY[profile.activity], level: t(`activity.${profile.activity}`) })}</span></li>
      <li><b>${t('me.ex.target', { n: fmtNum(tg.calories) })}</b><span>${t('me.ex.targetBody', { d: fmtNum(Math.max(0, tg.tdee - tg.calories)), kg: fmtNum(kgToDisplay(weekly, units, 2), 2), unit: wu })}</span></li>
      <li><b>${t('me.ex.floor', { n: fmtNum(Math.ceil(intakeFloor(p) / 10) * 10) })}</b><span>${t('me.ex.floorBody', { min: LIMITS.minIntake[profile.sex] ?? LIMITS.minIntake.other, pct: LIMITS.maxWeeklyPct * 100 })}</span></li>
      <li><b>${t('me.ex.protein', { min: tg.protein.min, max: tg.protein.max })}</b><span>${t('me.ex.proteinBody')}</span></li>
      <li><b>${t('me.ex.steps', { n: fmtNum(tg.steps) })}</b><span>${t('me.ex.stepsBody')}</span></li>
      <li><b>${t('me.ex.sleep', { h: tg.sleep.hours })}</b><span>${t('me.ex.sleepBody')}</span></li>
    </ol>
    <p class="hint">${t('me.ex.adjust')}</p>`;
}

export async function render(root) {
  const { user, profile, plan } = state;
  const units = user.units;
  mount(root, html`
    <section class="page me">
      <header class="page-head"><h1>${t('me.title')}</h1>${user.email ? html`<span class="page-date">${user.email}</span>` : ''}</header>
      ${demoBanner(user)}

      ${plan ? html`
        <section class="block">
          <header class="block-head"><h2>${t('me.plan')}</h2>
            <span class="muted">${plan.phase === 'maintain' ? t('me.phase.maintain') : t('me.phase.loss')}</span></header>
          <p>${t('me.planLine', {
            start: fmtNum(kgToDisplay(plan.startKg, units), 1), goal: fmtNum(kgToDisplay(plan.targets.goalKg, units), 1),
            unit: t(`unit.${weightUnit(units)}`), date: fmtDate(plan.option.endDate, 'year'), since: fmtDate(plan.createdAt, 'year'),
          })}</p>
          <h3>${t('me.how')}</h3>
          ${profile ? explain(profile, plan) : ''}
          <a class="btn btn-block" href="#/onboarding">${t('me.redo')}</a>
        </section>` : html`<a class="btn btn-primary btn-block" href="#/onboarding">${t('me.makePlan')}</a>`}

      ${plan ? html`<section class="block">
        <header class="block-head"><h2>${t('body.title')}</h2></header>
        ${(() => {
          const on = TRACKING_ITEMS.filter((k) => user.tracking?.[k]);
          return on.length ? html`<p>${t('me.bodyOn', { list: on.map((k) => t(`body.item.${k}`)).join(t('common.listSep')) })}</p>`
            : html`<p class="muted">${t('me.bodyOff')}</p>`;
        })()}
        <a class="btn btn-block" href="#/body">${t('me.bodyOpen')}</a>
      </section>` : ''}

      <section class="block">
        <header class="block-head"><h2>${t('me.settings')}</h2></header>
        <fieldset class="group">
          <legend>${t('settings.language')}</legend>
          <div class="segmented">
            <label><input type="radio" name="lang" value="zh" ${getLang() === 'zh' ? 'checked' : ''}><span>中文</span></label>
            <label><input type="radio" name="lang" value="en" ${getLang() === 'en' ? 'checked' : ''}><span>English</span></label>
          </div>
        </fieldset>
        <fieldset class="group">
          <legend>${t('ob.units')}</legend>
          <div class="segmented">
            ${UNIT_SYSTEMS.map((u) => html`<label><input type="radio" name="units" value="${u}" ${units === u ? 'checked' : ''}><span>${t(`units.${u}`)}</span></label>`)}
          </div>
        </fieldset>
      </section>

      <section class="block">
        <header class="block-head"><h2>${t('me.account')}</h2></header>
        <div class="stack">
          ${user.isDemo ? html`<button class="btn btn-block" type="button" data-signup>${t('me.demoSignup')}</button>` : html`
            <a class="btn btn-block" href="/api/export" download>${t('me.export')}</a>`}
          <button class="btn btn-block" type="button" data-logout>${t('me.logout')}</button>
          <button class="btn btn-block btn-danger" type="button" data-delete>${t('me.delete')}</button>
        </div>
        <p class="hint">${t('me.privacy')}</p>
      </section>

      <details class="block help-block"><summary>${t('help.title')}</summary>${helpResources()}</details>
      <p class="fineprint">${t('common.disclaimer')}</p>
    </section>`);

  on(root, 'change', '[name=lang]', (e, el) => changeLang(el.value));
  on(root, 'change', '[name=units]', async (e, el) => {
    const r = await post('/settings', { units: el.value });
    state.user = r.user;
    toast(t('common.saved'));
  });
  const logout = async () => {
    await post('/auth/logout');
    state.user = null;
    state.plan = null;
    state.profile = null;
  };
  on(root, 'click', '[data-logout]', async () => { await logout(); go('welcome'); });
  on(root, 'click', '[data-signup]', async () => { await logout(); go('register'); });
  on(root, 'click', '[data-delete]', () => {
    openSheet({
      title: t('me.delete'),
      closeLabel: t('common.close'),
      content: html`<form class="stack" novalidate>
        <p>${t('me.deleteBody')}</p>
        ${user.isDemo ? '' : html`<label class="field"><span>${t('auth.password')}</span><input name="password" type="password" autocomplete="current-password" required></label>`}
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-danger btn-block" type="submit">${t('me.deleteConfirm')}</button>
      </form>`,
      onMount(body, close) {
        const form = $('form', body);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await del('/account', { password: form.password?.value || '' });
            close();
            state.user = null;
            state.plan = null;
            state.profile = null;
            await refreshMe();
            toast(t('me.deleted'));
            go('welcome');
          } catch (err) {
            const box = $('.form-error', form);
            box.hidden = false;
            box.textContent = t(`err.${err.code}`, {}, t('err.generic'));
          }
        });
      },
    });
  });
}
