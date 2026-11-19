// B10: a failure that says nothing about the translation (provider error, pool
// spent, cut-off or malformed model output) only defers a queued job; a
// fact/meaning/number/script verdict counts as a rejected attempt
// (translations/jobs.mjs: back-off, manual queue after three).
const TRANSIENT_HE_FAILURES = new Set([
  '8004: Internal server error',
  'model_incomplete',
  'model_invalid_response',
  'ai_global_budget_exhausted', // B1: shared pool spent
  'no_route_available', // every provider unavailable (cooldown, daily cap, no key)
]);
// A malformed JSON answer (JSON.parse SyntaxError text) is a model output
// failure, not a fact/meaning verdict.
const MALFORMED_JSON = /^(?:Expected|Unexpected|Unterminated|Bad control character)\b.*\bJSON\b/;
const PROVIDER_ERROR =
  /^(?:\d{4}: |gemini_|upstream |HTTP \d|fetch failed|network|timeout|AbortError|TypeError)/i;

export function isTransientFailure(error) {
  const e = String(error || '');
  return TRANSIENT_HE_FAILURES.has(e) || MALFORMED_JSON.test(e) || PROVIDER_ERROR.test(e);
}
