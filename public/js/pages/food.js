import { html, mount, on, $, $$, openSheet, toast, icon, shrinkImage, debounce } from '../ui.js';
import { t, fmtNum, fmtDate, foodName, getLang } from '../i18n.js';
import { get, post, patch, del } from '../api.js';
import { state, go, today, route } from '../app.js';
import { addDays } from '../core/dates.js';
import { MEALS, COOKING, estimateItem, sumEntries } from '../core/nutrition.js';
import { searchFoods, getFood } from '../core/foods.js';
import { mealForNow } from './shared.js';

const COOK_KEYS = Object.keys(COOKING);

const kcalText = (e) => (e.kcal_low !== undefined && e.kcal_high !== undefined && e.kcal_high - e.kcal_low >= 20
  ? html`<span class="kcal">${fmtNum(e.kcal)}</span><small class="range">${fmtNum(e.kcal_low)}–${fmtNum(e.kcal_high)}</small>`
  : html`<span class="kcal">${fmtNum(e.kcal)}</span>`);

// ---------------------------------------------------------------- page

export async function render(root, params, alive) {
  let date = params[0] && /^\d{4}-\d{2}-\d{2}$/.test(params[0]) && params[0] <= today() ? params[0] : today();
  const openPhoto = params[0] === 'photo' || params[1] === 'photo';
  const [day, yesterday] = await Promise.all([get(`/food?date=${date}`), get(`/food?date=${addDays(date, -1)}`)]);
  if (!alive()) return;
  const target = state.plan?.targets;
  const entries = day.entries;
  const totals = sumEntries(entries);

  mount(root, html`
    <section class="page food">
      <header class="page-head">
        <h1>${t('food.title')}</h1>
        <div class="date-nav">
          <button class="icon-btn" data-day="-1" aria-label="${t('common.prevDay')}">${icon('left')}</button>
          <span>${date === today() ? t('common.today') : fmtDate(date, 'long')}</span>
          <button class="icon-btn" data-day="1" aria-label="${t('common.nextDay')}" ${date >= today() ? 'disabled' : ''}>${icon('right')}</button>
        </div>
      </header>
      <div class="day-summary">
        <span>${t('food.eaten')} <b>${fmtNum(totals.kcal)}</b>${target ? html` / ${fmtNum(target.calories)}` : ''} kcal</span>
        <span>${t('food.protein')} <b>${fmtNum(totals.protein)}</b>${target ? html` / ${target.protein.min}` : ''} g</span>
      </div>
      <button class="btn btn-primary btn-block btn-photo" type="button" data-photo>${icon('camera')}<span>${t('food.photoMeal')}</span></button>
      ${MEALS.map((meal) => {
        const list = entries.filter((e) => e.meal === meal);
        const prev = yesterday.entries.filter((e) => e.meal === meal);
        const sum = sumEntries(list);
        return html`
          <section class="meal" data-meal="${meal}">
            <header class="meal-head">
              <h2>${t(`meal.${meal}`)}</h2>
              ${list.length ? html`<span class="meal-kcal">${fmtNum(sum.kcal)} kcal</span>` : ''}
              <button class="btn btn-small" type="button" data-add="${meal}">${icon('plus', 16)}<span>${t('common.add')}</span></button>
            </header>
            ${list.length ? html`<ul class="entries">${list.map((e) => html`
              <li><button type="button" class="entry" data-entry="${e.id}">
                <span class="entry-name">${foodName(e)}${e.source === 'photo' ? html`<i class="src">${icon('camera', 14)}</i>` : ''}</span>
                <span class="entry-grams">${fmtNum(e.grams)} g</span>
                <span class="entry-kcal">${kcalText(e)}</span>
              </button></li>`)}</ul>`
            : html`<p class="meal-empty">${t('food.notLogged')}${prev.length ? html` <button class="btn-link" type="button" data-copy="${meal}">${icon('copy', 16)} ${t('food.sameAsYesterday', { n: prev.length })}</button>` : ''}</p>`}
          </section>`;
      })}
      <p class="fineprint">${t('food.rangeNote')}</p>
    </section>`);

  const reload = () => route();
  on(root, 'click', '[data-day]', (e, b) => {
    const next = addDays(date, Number(b.dataset.day));
    if (next > today()) return;
    go(next === today() ? 'food' : `food/${next}`);
  });
  on(root, 'click', '[data-photo]', () => openPhotoSheet({ date, meal: date === today() ? mealForNow() : 'lunch', onSaved: reload }));
  on(root, 'click', '[data-add]', (e, b) => openAddSheet({ date, meal: b.dataset.add, onSaved: reload }));
  on(root, 'click', '[data-entry]', (e, b) => openEntrySheet(entries.find((x) => x.id === Number(b.dataset.entry)), reload));
  on(root, 'click', '[data-copy]', async (e, b) => {
    b.disabled = true;
    await post('/food/copy', { from: addDays(date, -1), to: date, meal: b.dataset.copy });
    toast(t('food.copied'));
    reload();
  });
  if (openPhoto) {
    history.replaceState(null, '', '#/food');
    openPhotoSheet({ date, meal: mealForNow(), onSaved: reload });
  }
}

// --------------------------------------------------------------- helpers

function mealSelect(current) {
  return html`<label class="field field-inline"><span>${t('food.meal')}</span>
    <select name="meal">${MEALS.map((m) => html`<option value="${m}" ${m === current ? 'selected' : ''}>${t(`meal.${m}`)}</option>`)}</select></label>`;
}

function cookingSelect(value, name = 'cooking') {
  return html`<select name="${name}" aria-label="${t('food.cooking')}">${COOK_KEYS.map((k) => html`<option value="${k}" ${k === value ? 'selected' : ''}>${t(`cook.${k}`)}</option>`)}</select>`;
}

// ------------------------------------------------------------ entry edit

function openEntrySheet(entry, onSaved) {
  if (!entry) return;
  const sheet = openSheet({
    title: foodName(entry),
    closeLabel: t('common.close'),
    content: html`
      <form class="stack" novalidate>
        <label class="field"><span>${t('food.grams')}</span>
          <div class="input-unit"><input name="grams" type="number" inputmode="decimal" min="1" max="3000" value="${entry.grams}"><em>g</em></div></label>
        ${entry.plain ? html`<label class="field"><span>${t('food.cooking')}</span>${cookingSelect(entry.cooking)}</label>` : ''}
        ${mealSelect(entry.meal)}
        <p class="estimate" data-est></p>
        <div class="row-actions">
          <button class="btn btn-danger" type="button" data-delete>${icon('trash', 16)}<span>${t('common.delete')}</span></button>
          <button class="btn btn-primary" type="submit">${t('common.save')}</button>
        </div>
      </form>`,
    onMount(body, close) {
      const form = $('form', body);
      const est = () => {
        const e = estimateItem({ foodId: entry.foodId, per100: entry.per100, plain: entry.plain, grams: Number(form.grams.value), cooking: form.cooking?.value, source: entry.source });
        $('[data-est]', body).textContent = t('food.estimate', { kcal: fmtNum(e.kcal), protein: fmtNum(e.protein) });
      };
      form.addEventListener('input', est);
      est();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await patch(`/food/${entry.id}`, { grams: Number(form.grams.value), cooking: form.cooking?.value, meal: form.meal.value });
        close();
        toast(t('common.saved'));
        onSaved();
      });
      on(body, 'click', '[data-delete]', async () => {
        await del(`/food/${entry.id}`);
        close();
        toast(t('food.deleted'));
        onSaved();
      });
    },
  });
  return sheet;
}

// ------------------------------------------------------------- photo flow

export function openPhotoSheet({ date, meal, onSaved }) {
  let items = [];
  let result = null;
  let imageUrl = null;

  const itemRow = (it, i) => {
    const e = estimateItem({ ...it, source: 'photo' });
    const name = it.foodId ? foodName({ foodId: it.foodId }) : getLang() === 'en' ? it.name_en : it.name_zh;
    return html`<li class="pitem" data-i="${i}">
      <div class="pitem-top">
        <b>${name}</b>
        ${it.confidence < 0.6 ? html`<em class="tag tag-soft">${t('photo.unsure')}</em>` : ''}
        <button class="icon-btn" type="button" data-remove="${i}" aria-label="${t('common.remove')}">${icon('close', 16)}</button>
      </div>
      <div class="pitem-controls">
        <div class="stepper">
          <button type="button" class="icon-btn" data-step="-10" aria-label="−10 g">${icon('minus', 16)}</button>
          <input type="number" inputmode="decimal" min="1" max="2000" value="${it.grams}" data-grams="${i}" aria-label="${t('food.grams')}">
          <span>g</span>
          <button type="button" class="icon-btn" data-step="10" aria-label="+10 g">${icon('plus', 16)}</button>
        </div>
        ${it.plain ? cookingSelect(it.cooking, `cook-${i}`) : ''}
      </div>
      <p class="pitem-kcal">${t('photo.about', { kcal: fmtNum(e.kcal) })} <small>${fmtNum(e.low)}–${fmtNum(e.high)}</small></p>
    </li>`;
  };

  const totalLine = () => {
    const sum = items.reduce((s, it) => {
      const e = estimateItem({ ...it, source: 'photo' });
      return { kcal: s.kcal + e.kcal, low: s.low + e.low, high: s.high + e.high };
    }, { kcal: 0, low: 0, high: 0 });
    return html`<p class="photo-total"><span>${t('photo.total')}</span><b>${fmtNum(sum.kcal)} kcal</b><small>${t('photo.range', { low: fmtNum(sum.low), high: fmtNum(sum.high) })}</small></p>`;
  };

  const views = {
    pick: () => html`
      <div class="photo-pick">
        <label class="btn btn-primary btn-block">${icon('camera')}<span>${t('photo.take')}</span>
          <input type="file" accept="image/*" capture="environment" data-file hidden></label>
        <label class="btn btn-block">${icon('image')}<span>${t('photo.choose')}</span>
          <input type="file" accept="image/*" data-file hidden></label>
        <p class="hint">${t('photo.tip')}</p>
        ${state.ai?.demo ? html`<p class="notice notice-demo">${t('photo.demoNote')}</p>` : ''}
      </div>`,
    loading: () => html`
      <div class="photo-loading">
        ${imageUrl ? html`<img class="photo-preview" src="${imageUrl}" alt="">` : ''}
        <p class="pulse" role="status">${t('photo.reading')}</p>
      </div>`,
    error: (code) => html`
      <div class="stack">
        <div class="notice notice-warn"><p>${t(`photo.err.${code}`, {}, t('photo.err.generic'))}</p></div>
        <button class="btn btn-block" type="button" data-again>${t('photo.again')}</button>
        <button class="btn-link" type="button" data-search>${t('photo.useSearch')}</button>
      </div>`,
    result: () => html`
      <form class="stack" novalidate>
        <div class="photo-result-head">
          ${imageUrl ? html`<img class="photo-thumb" src="${imageUrl}" alt="">` : ''}
          <div>
            ${result.demo ? html`<em class="tag tag-demo">${t('photo.demoTag')}</em>` : ''}
            <p class="hint">${result.note || t('photo.checkHint')}</p>
          </div>
        </div>
        ${items.length ? html`<ul class="pitems">${items.map(itemRow)}</ul>` : html`<p class="muted">${t('photo.allRemoved')}</p>`}
        <button class="btn-link" type="button" data-search>${icon('search', 16)} ${t('photo.missing')}</button>
        <div data-total>${totalLine()}</div>
        ${mealSelect(meal)}
        <button class="btn btn-primary btn-block" type="submit" ${items.length ? '' : 'disabled'}>${t('photo.save')}</button>
      </form>`,
  };

  const sheet = openSheet({
    title: t('photo.title'),
    closeLabel: t('common.close'),
    content: views.pick(),
    onMount(body, close) {
      const show = (name, arg) => {
        mount(body, views[name](arg));
        if (name === 'result') bindResult(close);
      };
      body.addEventListener('change', async (e) => {
        const input = e.target.closest('[data-file]');
        if (!input || !input.files?.[0]) return;
        try {
          imageUrl = await shrinkImage(input.files[0]);
        } catch {
          return show('error', 'image');
        }
        show('loading');
        try {
          result = await post('/food/recognize', { image: imageUrl, lang: getLang() });
          if (!result.isFood) return show('error', 'notFood');
          items = result.items.map((it) => ({ ...it }));
          show('result');
        } catch (err) {
          show('error', err.code);
        }
      });
      on(body, 'click', '[data-again]', () => show('pick'));
      on(body, 'click', '[data-search]', () => {
        searchPicker((food, grams, cooking) => {
          items.push({ foodId: food.id, name_zh: food.zh, name_en: food.en, grams, cooking, plain: !!food.plain, per100: { k: food.k, p: food.p, c: food.c, f: food.f }, confidence: 1 });
          if (!result) result = { demo: false, note: '' };
          show('result');
        });
      });

      function bindResult(closeSheet) {
        const form = $('form', body);
        const refresh = () => mount($('[data-total]', body), totalLine());
        const rerenderRow = (i) => {
          const li = $(`.pitem[data-i="${i}"]`, body);
          const tmp = document.createElement('ul');
          tmp.innerHTML = String(itemRow(items[i], i));
          li.querySelector('.pitem-kcal').replaceWith(tmp.querySelector('.pitem-kcal'));
          refresh();
        };
        form.addEventListener('input', (e) => {
          const g = e.target.closest('[data-grams]');
          if (g) {
            const i = Number(g.dataset.grams);
            const v = Number(g.value);
            if (v >= 1 && v <= 2000) { items[i].grams = v; rerenderRow(i); }
          }
        });
        form.addEventListener('change', (e) => {
          const m = e.target.name?.match(/^cook-(\d+)$/);
          if (m) { items[Number(m[1])].cooking = e.target.value; rerenderRow(Number(m[1])); }
          if (e.target.name === 'meal') meal = e.target.value;
        });
        on(form, 'click', '[data-step]', (e, b) => {
          const li = b.closest('.pitem');
          const i = Number(li.dataset.i);
          items[i].grams = Math.max(1, Math.min(2000, items[i].grams + Number(b.dataset.step)));
          $(`[data-grams="${i}"]`, li).value = items[i].grams;
          rerenderRow(i);
        });
        on(form, 'click', '[data-remove]', (e, b) => {
          items.splice(Number(b.dataset.remove), 1);
          show('result');
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = form.querySelector('[type=submit]');
          btn.disabled = true;
          try {
            await post('/food', {
              date, meal: form.meal.value,
              items: items.map((it) => ({
                foodId: it.foodId, name: getLang() === 'en' ? it.name_en : it.name_zh, grams: it.grams,
                cooking: it.cooking, plain: it.plain, per100: it.foodId ? undefined : it.per100, source: 'photo',
              })),
            });
            closeSheet();
            toast(t('food.addedTo', { meal: t(`meal.${form.meal.value}`) }));
            onSaved?.();
          } catch (err) {
            btn.disabled = false;
            toast(t(`err.${err.code}`, {}, t('err.generic')));
          }
        });
      }
    },
  });
  return sheet;
}

// ---------------------------------------------------- search picker (nested)

function portionPicker(container, food, onPick, cta) {
  const portions = [0.5, 1, 1.5, 2];
  mount(container, html`
    <form class="stack portion" novalidate>
      <p class="portion-name"><b>${foodName({ foodId: food.id })}</b>
        <small>${t('food.per100', { kcal: food.k })}</small></p>
      <div class="segmented" role="group" aria-label="${t('food.portion')}">
        ${portions.map((m) => html`<label><input type="radio" name="mult" value="${m}" ${m === 1 ? 'checked' : ''}><span>${m === 1 ? food.u[getLang() === 'en' ? 1 : 0] : `×${m}`}</span></label>`)}
      </div>
      <label class="field"><span>${t('food.grams')}</span>
        <div class="input-unit"><input name="grams" type="number" inputmode="decimal" min="1" max="3000" value="${food.g}"><em>g</em></div></label>
      ${food.plain ? html`<label class="field"><span>${t('food.cooking')}</span>${cookingSelect('plain')}</label>` : ''}
      <p class="estimate" data-est></p>
      <button class="btn btn-primary btn-block" type="submit">${cta}</button>
    </form>`);
  const form = $('form', container);
  const est = () => {
    const e = estimateItem({ foodId: food.id, grams: Number(form.grams.value), cooking: form.cooking?.value || 'plain', source: 'db' });
    $('[data-est]', container).textContent = t('food.estimate', { kcal: fmtNum(e.kcal), protein: fmtNum(e.protein) });
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'mult') { form.grams.value = Math.round(food.g * Number(e.target.value)); }
    est();
  });
  form.addEventListener('input', est);
  est();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const g = Number(form.grams.value);
    if (!(g >= 1 && g <= 3000)) return;
    onPick(food, g, form.cooking?.value || 'plain');
  });
  form.grams.focus();
}

function searchBox(container, onChoose) {
  mount(container, html`
    <div class="search">
      <label class="search-input">${icon('search', 18)}<input type="search" placeholder="${t('food.searchPh')}" aria-label="${t('food.search')}" autocomplete="off"></label>
      <ul class="results" role="listbox"></ul>
    </div>`);
  const input = $('input', container);
  const list = $('.results', container);
  const run = () => {
    const q = input.value.trim();
    const found = searchFoods(q, 15);
    mount(list, q && !found.length ? html`<li class="muted">${t('food.noResults')}</li>`
      : html`${found.map((f) => html`<li><button type="button" class="result" data-food="${f.id}">
        <span>${foodName({ foodId: f.id })}</span><small class="pair"><span>${f.u[getLang() === 'en' ? 1 : 0]}</span><span>${fmtNum(Math.round(f.k * f.g / 100))} kcal</span></small></button></li>`)}`);
  };
  input.addEventListener('input', debounce(run, 120));
  on(list, 'click', '[data-food]', (e, b) => onChoose(getFood(b.dataset.food)));
  setTimeout(() => input.focus(), 50);
}

function searchPicker(onPick) {
  openSheet({
    title: t('food.search'),
    closeLabel: t('common.close'),
    content: html`<div data-area></div>`,
    onMount(body, close) {
      const area = $('[data-area]', body);
      searchBox(area, (food) => portionPicker(area, food, (f, g, c) => { close(); onPick(f, g, c); }, t('photo.addToList')));
    },
  });
}

// ------------------------------------------------------------ add sheet

export function openAddSheet({ date, meal, tab = 'search', onSaved }) {
  const TABS = ['search', 'recent', 'custom', 'photo'];
  const save = async (items, body, closeSheet) => {
    const m = $('[name=meal]', body)?.value || meal;
    const r = await post('/food', { date, meal: m, items });
    toast(t('food.addedTo', { meal: t(`meal.${m}`) }), {
      action: t('common.undo'),
      onAction: async () => { for (const e of r.entries) await del(`/food/${e.id}`); onSaved?.(); },
    });
    closeSheet();
    onSaved?.();
  };

  openSheet({
    title: t('food.addTitle'),
    closeLabel: t('common.close'),
    content: html`
      ${mealSelect(meal)}
      <div class="tabs-inline" role="tablist">
        ${TABS.map((x) => html`<button type="button" role="tab" data-tab="${x}" aria-selected="${x === tab}">${t(`food.tab.${x}`)}</button>`)}
      </div>
      <div data-panel></div>`,
    onMount(body, close) {
      const panel = $('[data-panel]', body);
      const showTab = async (name) => {
        $$('[data-tab]', body).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
        if (name === 'photo') {
          const m = $('[name=meal]', body).value;
          close();
          openPhotoSheet({ date, meal: m, onSaved });
          return;
        }
        if (name === 'search') {
          searchBox(panel, (food) => portionPicker(panel, food, (f, g, c) => save([{ foodId: f.id, grams: g, cooking: c, source: 'db' }], body, close), t('common.add')));
        } else if (name === 'recent') {
          mount(panel, html`<p class="muted">${t('common.loading')}</p>`);
          const { items } = await get(`/food/recent?today=${today()}`);
          mount(panel, items.length ? html`<ul class="results">${items.map((it, i) => html`<li><button type="button" class="result" data-recent="${i}">
              <span>${foodName(it)}</span><small class="pair"><span>${fmtNum(it.grams)} g</span><span>${fmtNum(it.kcal)} kcal</span></small></button></li>`)}</ul>`
            : html`<p class="muted">${t('food.noRecent')}</p>`);
          on(panel, 'click', '[data-recent]', (e, b) => {
            const it = items[Number(b.dataset.recent)];
            save([{ foodId: it.foodId, name: it.name, grams: it.grams, cooking: it.cooking, per100: it.per100 || undefined, plain: it.plain, source: 'recent' }], body, close);
          });
        } else if (name === 'custom') {
          mount(panel, html`
            <form class="stack" novalidate>
              <label class="field"><span>${t('food.custom.name')}</span><input name="name" maxlength="60" required></label>
              <div class="field-row">
                <label class="field"><span>${t('food.custom.kcal')}</span><input name="kcal" type="number" inputmode="numeric" min="0" max="5000" required></label>
                <label class="field"><span>${t('food.custom.protein')}</span><input name="protein" type="number" inputmode="decimal" min="0" max="300"></label>
              </div>
              <label class="field"><span>${t('food.custom.grams')}</span><input name="grams" type="number" inputmode="decimal" min="1" max="3000"><small>${t('food.custom.gramsHint')}</small></label>
              <p class="form-error" role="alert" hidden></p>
              <button class="btn btn-primary btn-block" type="submit">${t('common.add')}</button>
            </form>`);
          const form = $('form', panel);
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = form.name.value.trim();
            const kcal = Number(form.kcal.value);
            const protein = Number(form.protein.value) || 0;
            const grams = Number(form.grams.value) || 100;
            const err = $('.form-error', form);
            const k = (kcal / grams) * 100;
            const p = (protein / grams) * 100;
            if (!name || !(kcal >= 0) || form.kcal.value === '' || k > 900 || p > 100) {
              err.hidden = false;
              err.textContent = t('food.custom.err');
              return;
            }
            save([{ name, grams, per100: { k: Math.round(k * 10) / 10, p: Math.round(p * 10) / 10, c: 0, f: 0 }, source: 'custom' }], body, close);
          });
          form.name.focus();
        }
      };
      on(body, 'click', '[data-tab]', (e, b) => showTab(b.dataset.tab));
      showTab(tab);
    },
  });
}
