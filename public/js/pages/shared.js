import { html, icon } from '../ui.js';
import { t } from '../i18n.js';

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

/** Breakfast / lunch / dinner / snack by local time of day. */
export function mealForNow(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return 'breakfast';
  if (h < 14.5) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 21) return 'dinner';
  return 'snack';
}
