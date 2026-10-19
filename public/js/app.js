import { setLang, getLang, t } from './i18n.js';
import { get, post } from './api.js';
import { localToday } from './core/dates.js';
import { html, mount, icon, toast } from './ui.js';
import * as welcome from './pages/welcome.js';
import * as onboarding from './pages/onboarding.js';
import * as todayPage from './pages/today.js';
import * as food from './pages/food.js';
import * as train from './pages/train.js';
import * as weight from './pages/weight.js';
import * as me from './pages/me.js';
import * as body from './pages/body.js';

export const state = { user: null, profile: null, plan: null, ai: { enabled: false, demo: true }, config: null, booted: false };

export const today = () => localToday();

const PAGES = {
  welcome: welcome.renderWelcome,
  login: welcome.renderLogin,
  register: welcome.renderRegister,
  onboarding: onboarding.render,
  today: todayPage.render,
  food: food.render,
  train: train.render,
  weight: weight.render,
  me: me.render,
  body: body.render,
};
const PUBLIC = new Set(['welcome', 'login', 'register']);
const TABS = ['today', 'food', 'train', 'weight', 'me'];
/** Pages outside the tab bar that keep it visible, with their parent tab highlighted. */
const UNDER_TAB = { body: 'me' };

export function go(path) {
  const next = '#/' + path;
  if (location.hash === next) route();
  else location.hash = next;
}

export function units() {
  return state.user?.units || 'metric';
}

export async function refreshMe() {
  try {
    const data = await get('/me');
    state.user = data.user;
    state.profile = data.profile;
    state.plan = data.plan;
    state.ai = data.ai || { enabled: false, demo: true };
    state.config = data.config || state.config;
    if (data.user) setLang(data.user.lang);
  } catch (e) {
    if (e.status === 401) {
      state.user = null;
      state.profile = null;
      state.plan = null;
    } else throw e;
  }
}

export async function changeLang(lang) {
  setLang(lang);
  try { localStorage.setItem('glidepath.lang', lang); } catch { /* storage off */ }
  if (state.user) {
    const r = await post('/settings', { lang });
    state.user = r.user;
  }
  route();
}

function renderTabs(active) {
  const nav = document.getElementById('tabs');
  if (!active) {
    nav.hidden = true;
    return;
  }
  nav.hidden = false;
  mount(nav, html`${TABS.map((name) => html`
    <a href="#/${name}" class="tab${name === active ? ' active' : ''}" ${name === active ? html`aria-current="page"` : ''}>
      ${icon(name, 22)}<span>${t(`tab.${name}`)}</span>
    </a>`)}`);
}

let renderSeq = 0;

export async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  let name = parts[0] || '';
  const params = parts.slice(1).map(decodeURIComponent);

  if (!state.user && !PUBLIC.has(name)) name = 'welcome';
  else if (state.user && (PUBLIC.has(name) || name === '')) name = state.plan ? 'today' : 'onboarding';
  else if (state.user && !state.plan && (TABS.includes(name) || name in UNDER_TAB) && name !== 'me') name = 'onboarding';
  if (!PAGES[name]) name = state.user ? 'today' : 'welcome';

  const seq = ++renderSeq;
  // a fresh <main> on every render drops the previous page's delegated listeners
  const old = document.getElementById('view');
  const view = old.cloneNode(false);
  old.replaceWith(view);
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
  document.body.dataset.page = name;
  renderTabs(TABS.includes(name) ? name : UNDER_TAB[name] || null);
  try {
    await PAGES[name](view, params, () => seq === renderSeq);
    if (seq === renderSeq) {
      const h1 = view.querySelector('h1');
      document.title = h1 ? `${h1.textContent.trim()} · ${t('app.name')}` : t('app.name');
    }
  } catch (e) {
    if (seq !== renderSeq) return;
    console.error(e);
    if (e.status === 401) return;
    mount(view, html`<section class="page"><div class="notice notice-bad"><p>${t(e.code === 'offline' ? 'err.offline' : 'err.load')}</p>
      <button class="btn" data-retry>${t('common.retry')}</button></div></section>`);
    view.querySelector('[data-retry]').onclick = () => route();
  }
}

window.addEventListener('glidepath:unauthorized', () => {
  if (!state.user) return;
  state.user = null;
  state.plan = null;
  state.profile = null;
  toast(t('auth.expired'));
  go('welcome');
});

async function boot() {
  let saved = null;
  try { saved = localStorage.getItem('glidepath.lang'); } catch { /* storage off */ }
  const browserLang = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  setLang(saved === 'en' || saved === 'zh' ? saved : browserLang);
  try {
    await refreshMe();
  } catch {
    // offline on first load: show the welcome page; requests will retry later
  }
  state.booted = true;
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
