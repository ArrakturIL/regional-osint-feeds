// Same-day retries must be reserved for transient model/provider failures, not
// deterministic fact/meaning/number guards. Existing SHA+day claim remains authoritative.
const TRANSIENT_HE_FAILURES = new Set([
  '8004: Internal server error',
  'model_incomplete',
  'model_invalid_response',
  'ai_global_budget_exhausted', // B1: shared pool spent; retry after cooldown
]);
// A malformed JSON answer (JSON.parse SyntaxError text) is a model output
// failure, not a fact/meaning verdict; the router may answer on another try.
const MALFORMED_JSON = /^(?:Expected|Unexpected|Unterminated|Bad control character)\b.*\bJSON\b/;
export const HE_RETRY_COOLDOWN_MS = 30 * 60 * 1000;
// B5: the one same-day retry comes sooner for urgent/important news, inside its SLA.
export const HE_RETRY_COOLDOWN_BY_TIER = Object.freeze({
  urgent: 5 * 60 * 1000,
  important: 15 * 60 * 1000,
  normal: HE_RETRY_COOLDOWN_MS,
});
export function eligibleHebrewRetry(previous, now, tier = 'normal') {
  if (previous?.state !== 'error' || !Number.isInteger(previous.retry_count) || previous.retry_count !== 0)
    return false;
  if (!TRANSIENT_HE_FAILURES.has(previous.error) && !MALFORMED_JSON.test(String(previous.error || '')))
    return false;
  const at = previous.attempted_at_ms,
    cooldown = HE_RETRY_COOLDOWN_BY_TIER[tier] ?? HE_RETRY_COOLDOWN_MS;
  return Number.isFinite(at) && at > 0 && Number.isFinite(now) && now - at >= cooldown;
}
