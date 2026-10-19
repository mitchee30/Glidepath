// Food photo recognition. With ANTHROPIC_API_KEY (Claude) or OPENAI_API_KEY set
// it asks a vision model; without a key it returns sample results so the whole
// flow can be tried. Both providers get the same prompt and the same JSON schema,
// and their answers go through the same normalisation.

import { FOODS, getFood } from '../public/js/core/foods.js';
import { COOKING } from '../public/js/core/nutrition.js';

const COOKING_KEYS = Object.keys(COOKING);

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_food', 'items', 'note'],
  properties: {
    is_food: { type: 'boolean' },
    note: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name_zh', 'name_en', 'food_id', 'grams', 'cooking', 'kcal_per_100g', 'protein_per_100g',
          'carbs_per_100g', 'fat_per_100g', 'confidence'],
        properties: {
          name_zh: { type: 'string' },
          name_en: { type: 'string' },
          food_id: { type: ['string', 'null'] },
          grams: { type: 'number' },
          cooking: { type: 'string', enum: COOKING_KEYS },
          kcal_per_100g: { type: 'number' },
          protein_per_100g: { type: 'number' },
          carbs_per_100g: { type: 'number' },
          fat_per_100g: { type: 'number' },
          confidence: { type: 'number' },
        },
      },
    },
  },
};

function systemPrompt(lang) {
  const list = FOODS.map((f) => `${f.id}: ${f.zh} / ${f.en}${f.plain ? ' [ingredient]' : ''}`).join('\n');
  return `You estimate what is in a meal photo for a calorie log.

For every distinct food or drink you can see:
- Name it in Chinese (name_zh) and English (name_en).
- Estimate the edible weight in grams as served. Use plates, bowls, cutlery and hands for scale.
- If it matches one of the known foods below, set food_id to that id; otherwise food_id = null.
- Always fill kcal/protein/carbs/fat per 100 g as eaten (for known foods, use typical values).
- cooking: for items marked [ingredient], say how it looks prepared (plain = raw/boiled/steamed,
  grilled, panfried, stirfried, deepfried). For everything else use "plain" (oil is already included).
- confidence: 0 to 1 for how sure you are about the item and its weight.

If the photo shows no food, set is_food = false and items = [].
In note (one or two short sentences, ${lang === 'en' ? 'English' : 'Simplified Chinese'}), mention anything
that is hard to see and changes calories a lot (hidden oil, sauces, sugar in drinks, portion hidden by other food).

Known foods (id: Chinese / English):
${list}`;
}

const clamp = (v, lo, hi, d = lo) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Turns the model's answer into items the client can show and save. */
export function normalizeRecognition(parsed) {
  const items = (Array.isArray(parsed?.items) ? parsed.items : []).slice(0, 12).map((it) => {
    const food = it.food_id ? getFood(it.food_id) : null;
    const per100 = food
      ? { k: food.k, p: food.p, c: food.c, f: food.f }
      : { k: clamp(it.kcal_per_100g, 0, 900, 100), p: clamp(it.protein_per_100g, 0, 100, 0), c: clamp(it.carbs_per_100g, 0, 100, 0), f: clamp(it.fat_per_100g, 0, 100, 0) };
    return {
      name_zh: String(it.name_zh || food?.zh || '').slice(0, 60) || food?.zh || '食物',
      name_en: String(it.name_en || food?.en || '').slice(0, 60) || food?.en || 'Food',
      foodId: food?.id ?? null,
      grams: Math.round(clamp(it.grams, 1, 2000, 100)),
      cooking: COOKING_KEYS.includes(it.cooking) ? it.cooking : 'plain',
      plain: food ? !!food.plain : false,
      per100,
      confidence: Math.round(clamp(it.confidence, 0, 1, 0.5) * 100) / 100,
    };
  });
  return { isFood: parsed?.is_food !== false && items.length > 0, items, note: String(parsed?.note || '').slice(0, 300) };
}

export async function recognizeWithOpenAI({ image, lang, apiKey, model, detail, fetchImpl = fetch, timeoutMs = 30000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_schema', json_schema: { name: 'meal', strict: true, schema: SCHEMA } },
        messages: [
          { role: 'system', content: systemPrompt(lang) },
          { role: 'user', content: [
            { type: 'text', text: 'What is in this meal, and how much?' },
            { type: 'image_url', image_url: { url: image, detail } },
          ] },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`openai ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg || msg.refusal || !msg.content) return { isFood: false, items: [], note: '' };
    return normalizeRecognition(JSON.parse(msg.content));
  } finally {
    clearTimeout(timer);
  }
}

const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Claude Messages API with structured output (output_config.format = json_schema).
 * The image is sent as a base64 block before the question, as the vision guide recommends.
 */
export async function recognizeWithAnthropic({ image, lang, apiKey, model, effort, fetchImpl = fetch, timeoutMs = 45000 }) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image);
  if (!m) throw new Error('bad image data URL');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const outputConfig = { format: { type: 'json_schema', schema: SCHEMA } };
    if (effort) outputConfig.effort = effort;
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt(lang),
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
            { type: 'text', text: 'What is in this meal, and how much?' },
          ],
        }],
        output_config: outputConfig,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`anthropic ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    if (data?.stop_reason === 'refusal') return { isFood: false, items: [], note: '' };
    if (data?.stop_reason === 'max_tokens') throw new Error('anthropic: hit max_tokens');
    const text = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (!text) return { isFood: false, items: [], note: '' };
    return normalizeRecognition(JSON.parse(text));
  } finally {
    clearTimeout(timer);
  }
}

/** ai: { provider: 'anthropic' | 'openai', key, model, effort?, detail? } */
export function recognize(ai, { image, lang, fetchImpl }) {
  if (ai.provider === 'anthropic') {
    return recognizeWithAnthropic({ image, lang, apiKey: ai.key, model: ai.model, effort: ai.effort, fetchImpl });
  }
  return recognizeWithOpenAI({ image, lang, apiKey: ai.key, model: ai.model, detail: ai.detail, fetchImpl });
}

// --------------------------------------------------------------- demo mode

const SAMPLES = [
  { note: { zh: '炒菜里的油看不出来，实际可能更高。', en: 'Cooking oil is hard to see; the real number may be higher.' },
    items: [['rice', 160, 'plain', 0.9], ['tomato_egg', 220, 'plain', 0.8], ['greens', 150, 'stirfried', 0.7]] },
  { note: { zh: '酱汁的量不确定。', en: 'The amount of sauce is uncertain.' },
    items: [['chicken_breast', 130, 'grilled', 0.85], ['broccoli', 120, 'plain', 0.9], ['sweet_potato', 180, 'plain', 0.8]] },
  { note: { zh: '奶茶的糖量差别很大，可以按实际甜度修改。', en: 'Sugar in milk tea varies a lot; adjust for your sweetness level.' },
    items: [['beef_noodle_soup', 600, 'plain', 0.75], ['bubble_tea', 500, 'plain', 0.7]] },
  { note: { zh: '沙拉酱的分量看不清。', en: 'The dressing amount is hard to see.' },
    items: [['salmon', 120, 'panfried', 0.8], ['lettuce', 80, 'plain', 0.9], ['avocado', 60, 'plain', 0.8], ['mayo', 15, 'plain', 0.5]] },
];

export function demoRecognition(image, lang) {
  // pick a sample from the image bytes so different photos give different results
  let h = 0;
  for (let i = 0; i < image.length; i += 997) h = (h * 31 + image.charCodeAt(i)) >>> 0;
  const s = SAMPLES[h % SAMPLES.length];
  const items = s.items.map(([id, grams, cooking, confidence]) => {
    const f = getFood(id);
    return { name_zh: f.zh, name_en: f.en, foodId: id, grams, cooking, plain: !!f.plain, per100: { k: f.k, p: f.p, c: f.c, f: f.f }, confidence };
  });
  return { isFood: true, items, note: s.note[lang === 'en' ? 'en' : 'zh'], demo: true };
}
