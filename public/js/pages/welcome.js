import { html, mount, on, $ } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { post } from '../api.js';
import { state, go, refreshMe, changeLang, today } from '../app.js';

function langSwitch() {
  const lang = getLang();
  return html`<div class="lang-switch" role="group" aria-label="${t('settings.language')}">
    <button type="button" data-lang="zh" aria-pressed="${lang === 'zh'}">中文</button>
    <button type="button" data-lang="en" aria-pressed="${lang === 'en'}">English</button>
  </div>`;
}

function bindLang(root) {
  on(root, 'click', '[data-lang]', (e, b) => changeLang(b.dataset.lang));
}

// A gently falling, slightly noisy weight line: the product in one picture.
function heroLine() {
  const pts = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i <= 28; i++) pts.push([12 + i * 11.5, 40 + i * 2.6 + (rnd() - 0.5) * 16]);
  const avg = pts.map((p, i) => {
    const w = pts.slice(Math.max(0, i - 6), i + 1);
    return [p[0], w.reduce((s, q) => s + q[1], 0) / w.length];
  });
  const d = avg.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return html`<svg class="hero-line" viewBox="0 0 346 140" aria-hidden="true">
    ${pts.map((p) => html`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2"/>`)}
    <path d="${d}"/>
  </svg>`;
}

export async function renderWelcome(root) {
  mount(root, html`
    <section class="page welcome">
      <header class="welcome-top">
        <span class="brand">${t('app.name')}</span>
        ${langSwitch()}
      </header>
      <div class="hero-sheet grid-paper">
        ${heroLine()}
        <h1 class="hero-title">${t('welcome.title')}</h1>
        <p class="hero-sub">${t('welcome.sub')}</p>
      </div>
      <ul class="welcome-points">
        <li><b>${t('welcome.p1.title')}</b><span>${t('welcome.p1.body')}</span></li>
        <li><b>${t('welcome.p2.title')}</b><span>${t('welcome.p2.body')}</span></li>
        <li><b>${t('welcome.p3.title')}</b><span>${t('welcome.p3.body')}</span></li>
      </ul>
      <div class="welcome-actions">
        <a class="btn btn-primary btn-block" href="#/register">${t('auth.createAccount')}</a>
        <a class="btn btn-block" href="#/login">${t('auth.login')}</a>
        <button class="btn-link" type="button" data-demo>${t('welcome.tryDemo')}</button>
      </div>
      <p class="fineprint">${t('common.disclaimer')}</p>
    </section>`);
  bindLang(root);
  on(root, 'click', '[data-demo]', async (e, b) => {
    b.disabled = true;
    b.textContent = t('welcome.demoLoading');
    try {
      await post('/auth/demo', { today: today(), lang: getLang() });
      await refreshMe();
      go('today');
    } catch (err) {
      b.disabled = false;
      b.textContent = t('welcome.tryDemo');
      alertError(root, err);
    }
  });
}

function alertError(root, err) {
  const box = $('[data-error]', root) || root.querySelector('.welcome-actions');
  const msg = t(`err.${err.code}`, {}, t('err.generic'));
  let p = root.querySelector('.form-error');
  if (!p) {
    p = document.createElement('p');
    p.className = 'form-error';
    p.setAttribute('role', 'alert');
    box.prepend(p);
  }
  p.textContent = msg;
}

function authForm(root, mode) {
  const isLogin = mode === 'login';
  mount(root, html`
    <section class="page auth">
      <header class="welcome-top">
        <a class="back-link" href="#/welcome">${t('common.back')}</a>
        ${langSwitch()}
      </header>
      <h1>${isLogin ? t('auth.loginTitle') : t('auth.registerTitle')}</h1>
      <form class="stack" novalidate data-error>
        <label class="field">
          <span>${t('auth.email')}</span>
          <input name="email" type="email" autocomplete="email" inputmode="email" required>
        </label>
        <label class="field">
          <span>${t('auth.password')}</span>
          <input name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="8" required>
          ${isLogin ? '' : html`<small>${t('auth.passwordHint')}</small>`}
        </label>
        <button class="btn btn-primary btn-block" type="submit">${isLogin ? t('auth.login') : t('auth.createAccount')}</button>
      </form>
      <p class="auth-switch">${isLogin ? html`${t('auth.noAccount')} <a href="#/register">${t('auth.createAccount')}</a>` : html`${t('auth.haveAccount')} <a href="#/login">${t('auth.login')}</a>`}</p>
    </section>`);
  bindLang(root);
  const form = root.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await post(isLogin ? '/auth/login' : '/auth/register', {
        email: form.email.value, password: form.password.value, lang: getLang(),
      });
      await refreshMe();
      go(state.plan ? 'today' : 'onboarding');
    } catch (err) {
      btn.disabled = false;
      alertError(root, err);
    }
  });
  form.email.focus();
}

export async function renderLogin(root) {
  authForm(root, 'login');
}

export async function renderRegister(root) {
  authForm(root, 'register');
}
