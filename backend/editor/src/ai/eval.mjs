// B6: blind A/B of translation models on a fixed corpus (eval-fixtures.mjs).
// Started by an editor_state flag, runs a few calls per 5-min tick inside the
// shared AI pool, and writes one row per (fixture, language, model) into
// ai_eval_runs. Every model gets the production prompt and request shape and
// is scored by the production checks (shared verify + numbers + script).
// Outputs are kept so a reviewer can judge them blind (scripts/ai-eval-report.mjs).
import { EVAL_FIXTURES } from './eval-fixtures.mjs';
import { runStep } from './router.mjs';
import { heTranslateInput, ruTitlesInput } from '../translations/prompts.mjs';
import { translationIssue } from '../translations/verify.mjs';
import { validateCandidate } from '../translations/news-mirror.mjs';

export const EVAL_KEY = 'ai_eval_request';
const GEMINI_LITE = { provider: 'gemini', family: 'flash-lite', dailyCap: 450 };
const cf = model => ({ provider: 'cloudflare', model });
// Model IDs checked against the Workers AI catalog on 18.11.2026.
export const EVAL_CANDIDATES = Object.freeze({
  he: [
    { id: 'gemini-flash-lite', step: GEMINI_LITE },
    { id: 'glm-4.7-flash', step: cf('@cf/zai-org/glm-4.7-flash') },
    { id: 'glm-5.3-flash', step: cf('@cf/zai-org/glm-5.3-flash') },
    { id: 'gemma-4-26b', step: cf('@cf/google/gemma-4-26b-a4b-it') },
  ],
  ru: [
    { id: 'llama-3.3-70b', step: cf('@cf/meta/llama-3.3-70b-instruct-fp8-fast') },
    { id: 'gemini-flash-lite', step: GEMINI_LITE },
    { id: 'glm-5.3-flash', step: cf('@cf/zai-org/glm-5.3-flash') },
    { id: 'gemma-4-26b', step: cf('@cf/google/gemma-4-26b-a4b-it') },
  ],
});

export function evalPlan(fixtures = EVAL_FIXTURES, candidates = EVAL_CANDIDATES) {
  const plan = [];
  for (const f of fixtures)
    for (const lang of f.to)
      for (const c of candidates[lang] || [])
        plan.push({ fixture: f, lang, candidate: c, key: f.id + '|' + lang + '|' + c.id });
  return plan;
}

const text = out => {
  const raw = out?.choices?.[0]?.message?.content ?? out?.response;
  return typeof raw === 'string' ? raw.trim() : raw && typeof raw === 'object' ? JSON.stringify(raw) : '';
};
const parse = s => {
  try {
    return JSON.parse(s);
  } catch {}
  const m = String(s).match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!m) throw new Error('bad_json');
  try {
    return JSON.parse(m[0]);
  } catch {
    throw new Error('bad_json');
  }
};

// Same checks as production, one reason code (null = accepted).
function fieldIssue(source, translated, lang) {
  if (!source) return translated && translated.trim() ? 'invented_field' : null;
  if (typeof translated !== 'string' || !translated.trim()) return 'missing_field';
  return (
    translationIssue(source, translated, lang) ||
    (validateCandidate(source, translated, lang) ? null : 'format_or_numbers')
  );
}

export function scoreAnswer(fixture, lang, out) {
  const raw = text(out);
  let value;
  try {
    value = parse(raw);
  } catch {
    return { ok: false, issue: 'bad_json', output: { raw: raw.slice(0, 600) } };
  }
  if (lang === 'ru')
    value = Array.isArray(value)
      ? value[0]
      : value && typeof value === 'object' && !('title_ru' in value)
        ? Object.values(value)[0]
        : value;
  const title = lang === 'he' ? value?.title : value?.title_ru;
  const body = lang === 'he' ? value?.body : value?.summary_ru;
  const confidence = lang === 'he' ? value?.confidence : null;
  const issue =
    fieldIssue(fixture.title, title, lang) ||
    fieldIssue(fixture.body, body ?? '', lang) ||
    (lang === 'he' && !(Number.isInteger(confidence) && confidence >= 85 && confidence <= 100)
      ? 'low_translation_confidence'
      : null);
  return {
    ok: !issue,
    issue,
    output: { title: String(title ?? '').slice(0, 400), body: String(body ?? '').slice(0, 900), confidence },
  };
}

const inputFor = (fixture, lang) =>
  lang === 'he'
    ? heTranslateInput('news', { title: fixture.title, body: fixture.body || '', comment: '' })
    : ruTitlesInput([{ id: fixture.id, headline: fixture.title, summary: fixture.body || '' }]);

async function ensureTable(db) {
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS ai_eval_runs(run_id TEXT NOT NULL,fixture_id TEXT NOT NULL,language TEXT NOT NULL,candidate TEXT NOT NULL,' +
        'model TEXT,ok INTEGER NOT NULL,issue TEXT,output TEXT,neurons REAL NOT NULL DEFAULT 0,latency_ms INTEGER,created_ms INTEGER NOT NULL,' +
        'PRIMARY KEY(run_id,fixture_id,language,candidate))',
    )
    .run();
}

/**
 * One bounded step of a requested run. Request (editor_state ai_eval_request):
 * {run_id, status:'running', per_tick?:3, daily_neurons?:2000, pool_ceiling?:6000}.
 * Cloudflare calls stop for the day when this run spent daily_neurons or the
 * shared pool passed pool_ceiling, so production translation keeps priority.
 */
export async function runEvalTick(env, now = Date.now(), deps = {}) {
  const db = env.NEWS_DB;
  const row = await db
    .prepare('SELECT value FROM editor_state WHERE key=?')
    .bind(EVAL_KEY)
    .first()
    .catch(() => null);
  let req;
  try {
    req = JSON.parse(row?.value || 'null');
  } catch {
    return null;
  }
  if (!req || req.status !== 'running' || !req.run_id) return null;
  await ensureTable(db);
  const day = new Date(now).toISOString().slice(0, 10),
    dayStart = Date.parse(day + 'T00:00:00Z');
  const done = new Set(
    (
      (
        await db
          .prepare('SELECT fixture_id,language,candidate FROM ai_eval_runs WHERE run_id=?')
          .bind(req.run_id)
          .all()
      ).results || []
    ).map(r => r.fixture_id + '|' + r.language + '|' + r.candidate),
  );
  const spent =
    (
      await db
        .prepare('SELECT COALESCE(SUM(neurons),0) n FROM ai_eval_runs WHERE run_id=? AND created_ms>=?')
        .bind(req.run_id, dayStart)
        .first()
    )?.n || 0;
  const pool =
    (
      await db
        .prepare('SELECT neurons FROM ai_daily_neurons WHERE day_utc=?')
        .bind(day)
        .first()
        .catch(() => null)
    )?.neurons || 0;
  const cfAllowed = spent < (req.daily_neurons ?? 2000) && pool < (req.pool_ceiling ?? 6000);
  const plan = evalPlan(),
    remaining = plan.filter(p => !done.has(p.key));
  let calls = 0;
  for (const p of remaining) {
    if (calls >= (req.per_tick ?? 3)) break;
    if (p.candidate.step.provider === 'cloudflare' && !cfAllowed) continue;
    const t0 = Date.now();
    let out, score;
    try {
      out = await runStep(env, p.candidate.step, inputFor(p.fixture, p.lang), deps);
      if (out === null) continue; // unavailable now (no key, cap, cooldown): try on a later tick
      calls++;
      score = scoreAnswer(p.fixture, p.lang, out);
    } catch (e) {
      calls++;
      const msg = String(e?.message || e).slice(0, 120);
      if (/ai_global_budget_exhausted/.test(msg)) break;
      score = { ok: false, issue: 'provider_error:' + msg, output: null };
    }
    await db
      .prepare(
        'INSERT OR IGNORE INTO ai_eval_runs(run_id,fixture_id,language,candidate,model,ok,issue,output,neurons,latency_ms,created_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        req.run_id,
        p.fixture.id,
        p.lang,
        p.candidate.id,
        out?.model || p.candidate.step.model || p.candidate.step.family,
        score.ok ? 1 : 0,
        score.issue,
        score.output ? JSON.stringify(score.output) : null,
        Number(out?.usage?.neurons) || 0,
        Date.now() - t0,
        now,
      )
      .run();
    done.add(p.key);
  }
  if (plan.every(p => done.has(p.key)))
    await db
      .prepare('UPDATE editor_state SET value=?,updated_ms=? WHERE key=?')
      .bind(JSON.stringify({ ...req, status: 'done', finished_ms: now }), now, EVAL_KEY)
      .run();
  return { run_id: req.run_id, calls, done: done.size, total: plan.length, cf_allowed: cfAllowed };
}
