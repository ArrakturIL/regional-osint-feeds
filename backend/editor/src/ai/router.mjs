// B2: task → ordered provider chain. Starting hypothesis (B6 A/B decides the
// final chains): Gemini Flash-Lite first for Hebrew, Cloudflare as fallback.
// Any provider error falls through to the next step in the same call.
import { geminiChat, listModels, pickModel } from './providers/gemini.mjs';
import { RU_TITLES_MODEL } from '../translations/prompts.mjs';

const GEMINI_LITE = { provider: 'gemini', family: 'flash-lite', dailyCap: 450 }; // project quota 500 RPD, shared by all tasks
const GLM = { provider: 'cloudflare', model: '@cf/zai-org/glm-4.7-flash' };
export const ROUTES = {
  analyst_decision: [GEMINI_LITE, GLM], // B7
  analyst_translate: [GEMINI_LITE, GLM], // B7
  // 19.11: RU titles left the shared Workers AI pool to llama-70B alone
  // (7 414 of 8 623 neurons on 18.11, analysts starved). Gemini first; llama
  // takes what Gemini cannot do or what the gate rejects (per item).
  ru_titles: [GEMINI_LITE, { provider: 'cloudflare', model: RU_TITLES_MODEL }],
  he_translate: [
    { provider: 'gemini', family: 'flash-lite', dailyCap: 450 }, // project quota 500 RPD
    { provider: 'cloudflare', model: '@cf/zai-org/glm-4.7-flash' },
  ],
};
const COOLDOWN_MS = 10 * 60_000;
const memo = {};

async function stateGet(db, key) {
  const row = await db.prepare('SELECT value FROM editor_state WHERE key=?').bind(key).first();
  return row?.value ?? null;
}
async function stateSet(db, key, value, now) {
  await db
    .prepare(
      'INSERT INTO editor_state(key,value,updated_ms) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms',
    )
    .bind(key, value, now)
    .run();
}

// Resolved once per UTC day per family, cached in editor_state.
async function geminiModel(env, family, doFetch, now) {
  const day = new Date(now).toISOString().slice(0, 10),
    key = 'gemini_model:' + family;
  if (memo[key]?.day === day) return memo[key].model;
  const cached = await stateGet(env.NEWS_DB, key).catch(() => null);
  if (cached) {
    const [d, m] = cached.split('|');
    if (d === day && m) {
      memo[key] = { day, model: m };
      return m;
    }
  }
  const model = pickModel(await listModels(env.GEMINI_API_KEY, doFetch), family);
  if (!model) throw new Error('gemini_no_model_' + family);
  memo[key] = { day, model };
  await stateSet(env.NEWS_DB, key, day + '|' + model, now).catch(() => {});
  return model;
}

let tableReady = false;
async function reserveCall(db, id, cap, now) {
  if (!tableReady) {
    await db
      .prepare(
        'CREATE TABLE IF NOT EXISTS ai_provider_calls(day_utc TEXT NOT NULL,provider_model TEXT NOT NULL,calls INTEGER NOT NULL DEFAULT 0,updated_ms INTEGER NOT NULL,PRIMARY KEY(day_utc,provider_model))',
      )
      .bind()
      .run();
    tableReady = true;
  }
  const day = new Date(now).toISOString().slice(0, 10);
  const r = await db
    .prepare(
      'INSERT INTO ai_provider_calls(day_utc,provider_model,calls,updated_ms) SELECT ?1,?2,1,?3 WHERE 1<=?4 ' +
        'ON CONFLICT(day_utc,provider_model) DO UPDATE SET calls=calls+1,updated_ms=excluded.updated_ms WHERE ai_provider_calls.calls+1<=?4',
    )
    .bind(day, id, now, cap)
    .run();
  return r?.meta?.changes === 1;
}

// One provider step, no fallback. Returns null when the step is unavailable
// (no key, cooldown, daily cap); throws on a provider error. Used by chat()
// and by the B6 blind evaluation, so both call models exactly the same way.
export async function runStep(env, step, input, deps = {}) {
  const doFetch = deps.fetch || fetch,
    now = (deps.now || Date.now)();
  if (step.provider === 'cloudflare') {
    const out = await env.AI.run(step.model, input);
    return { ...out, model: step.model };
  }
  if (!env.GEMINI_API_KEY || !env.NEWS_DB) return null;
  const id = 'gemini:' + step.family;
  const until = Number(await stateGet(env.NEWS_DB, 'cooldown:' + id).catch(() => 0)) || 0;
  if (until > now) return null;
  if (!(await reserveCall(env.NEWS_DB, id, step.dailyCap, now))) return null;
  try {
    const model = await geminiModel(env, step.family, doFetch, now);
    const out = await geminiChat(env.GEMINI_API_KEY, model, input, doFetch);
    return { ...out, model };
  } catch (e) {
    if (e.status === 429 || e.status >= 500)
      await stateSet(env.NEWS_DB, 'cooldown:gemini:' + step.family, String(now + COOLDOWN_MS), now).catch(
        () => {},
      );
    throw e;
  }
}

// accept(out) → null to take the answer, or a rejection code: the next
// provider in the chain is tried in the same call (19.11: a Hebrew answer the
// script/meaning gate rejects no longer waits for a next-day retry). Neurons
// of rejected Cloudflare answers are reported as rejected_neurons / .neurons.
export async function chat(env, task, input, deps = {}, accept = null) {
  let last = new Error('no_route_available'),
    spent = 0;
  for (const step of ROUTES[task] || []) {
    try {
      const out = await runStep(env, step, input, deps);
      if (!out) continue;
      const rejected = accept ? accept(out) : null;
      if (!rejected) return spent ? { ...out, rejected_neurons: spent } : out;
      spent += Number(out?.usage?.neurons) || 0;
      last = Object.assign(new Error(rejected), { rejected: true, model: out.model });
    } catch (e) {
      last = e;
    }
  }
  if (spent) last.neurons = spent;
  throw last;
}
