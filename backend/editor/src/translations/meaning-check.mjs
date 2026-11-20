// B11 part 2: urgent and important translations get a second opinion on who
// did what from a different model than the one that translated (19.11: roles,
// names and dropped participants slipped past the glossary and the rules).
// The verdict rejects only a named meaning error; if no checker answers, the
// translation stands — it already passed every deterministic gate.
import { ROUTES, runStep } from '../ai/router.mjs';
import { meaningCheckInput, MEANING_ERRORS } from './prompts.mjs';

export const MEANING_CHECK_TIERS = Object.freeze(['urgent', 'important']);
const family = model => (String(model || '').startsWith('gemini') ? 'gemini' : String(model || ''));
const stepFamily = step => (step.provider === 'gemini' ? 'gemini' : step.model);

// Daily verdict counters for /ops and the acceptance check.
async function count(env, verdict, now) {
  if (!env.NEWS_DB) return;
  const key = 'meaning_check:' + new Date(now).toISOString().slice(0, 10);
  await env.NEWS_DB.prepare(
    "INSERT INTO editor_state(key,value,updated_ms) VALUES(?,json_object(?,1),?) ON CONFLICT(key) DO UPDATE SET value=json_set(value,'$.'||?,COALESCE(json_extract(value,'$.'||?),0)+1),updated_ms=excluded.updated_ms",
  )
    .bind(key, verdict, now, verdict, verdict)
    .run()
    .catch(() => {});
}

// B12: the day's first rejections with both texts and the checker's evidence,
// so a verdict can be audited (the rejected translation is not stored elsewhere).
export const MEANING_SAMPLES_PER_DAY = 20;
async function sample(env, args, result, now) {
  if (!env.NEWS_DB) return;
  const cut = (x, n) => String(x || '').slice(0, n);
  const item = {
    at_ms: now,
    language: args.language,
    tier: args.tier,
    code: result.code,
    checker: result.model || null,
    translator: args.translatorModel || null,
    evidence: cut(result.evidence, 160),
    original: cut(args.original?.title, 260),
    translation: cut(args.translation?.title, 260),
  };
  await env.NEWS_DB.prepare(
    "INSERT INTO editor_state(key,value,updated_ms) VALUES(?,json_array(json(?)),?) ON CONFLICT(key) DO UPDATE SET value=CASE WHEN json_array_length(value)<? THEN json_insert(value,'$[#]',json(?)) ELSE value END,updated_ms=excluded.updated_ms",
  )
    .bind(
      'meaning_check_samples:' + new Date(now).toISOString().slice(0, 10),
      JSON.stringify(item),
      now,
      MEANING_SAMPLES_PER_DAY,
      JSON.stringify(item),
    )
    .run()
    .catch(() => {});
}

// → { verdict: 'ok' | 'reject' | 'unavailable', code?, model?, evidence?, neurons }
export async function meaningCheck(env, args, now = Date.now()) {
  const result = await check(env, args);
  if (!result.skipped) await count(env, result.verdict, now);
  if (result.verdict === 'reject') await sample(env, args, result, now);
  return result;
}
async function check(env, { original, translation, language, translatorModel, tier }) {
  if (!MEANING_CHECK_TIERS.includes(tier)) return { verdict: 'ok', skipped: true, neurons: 0 };
  let neurons = 0;
  for (const step of ROUTES.meaning_check) {
    if (stepFamily(step) === family(translatorModel)) continue; // never the translator itself
    try {
      const out = await runStep(env, step, meaningCheckInput(original, translation, language));
      if (!out) continue;
      neurons += Number(out?.usage?.neurons) || 0;
      const raw = out?.choices?.[0]?.message?.content ?? out?.response;
      const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof value?.same_meaning !== 'boolean') continue;
      if (value.same_meaning === false && MEANING_ERRORS.includes(value.error))
        return {
          verdict: 'reject',
          code: 'meaning:' + value.error,
          model: out.model,
          evidence: typeof value.evidence === 'string' ? value.evidence : '',
          neurons,
        };
      return { verdict: 'ok', model: out.model, neurons };
    } catch {
      // next checker
    }
  }
  return { verdict: 'unavailable', neurons };
}
