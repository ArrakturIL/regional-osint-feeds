// Same-day retries must be reserved for transient model/provider failures, not
// deterministic fact/meaning/number guards. Existing SHA+day claim remains authoritative.
const TRANSIENT_HE_FAILURES=new Set([
  '8004: Internal server error','model_incomplete','model_invalid_response',
  'ai_global_budget_exhausted' // B1: shared pool spent; retry after cooldown
]);
export const HE_RETRY_COOLDOWN_MS=30*60*1000;
export function eligibleHebrewRetry(previous,now){
  if(previous?.state!=='error'||!Number.isInteger(previous.retry_count)||previous.retry_count!==0)return false;
  if(!TRANSIENT_HE_FAILURES.has(previous.error))return false;
  const at=previous.attempted_at_ms;
  return Number.isFinite(at)&&at>0&&Number.isFinite(now)&&now-at>=HE_RETRY_COOLDOWN_MS;
}
