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

// → { verdict: 'ok' | 'reject' | 'unavailable', code?, model?, neurons }
export async function meaningCheck(env, args, now = Date.now()) {
  const result = await check(env, args);
  if (!result.skipped) await count(env, result.verdict, now);
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
        return { verdict: 'reject', code: 'meaning:' + value.error, model: out.model, neurons };
      return { verdict: 'ok', model: out.model, neurons };
    } catch {
      // next checker
    }
  }
  return { verdict: 'unavailable', neurons };
}
