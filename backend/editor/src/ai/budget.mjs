// B1: one shared daily Workers AI pool for every Editor pipeline.
// Cloudflare's free allocation is 10 000 neurons/day for the whole account.
// Before 18.11 each pipeline had its own hard cap; all of them hit it daily
// while only 40-55% of the free pool was used. Now every call is charged to a
// single atomic D1 ledger, and per-pipeline caps are only safety ceilings.
export const AI_POOL_NEURONS = 8500; // 1 500 headroom for estimate error
// Per-call estimates calibrated on Cloudflare GraphQL usage 11-17.11.2026
// (llama-3.3-70b ~55, glm-4.7-flash ~12 neurons per call), rounded up.
// 19.11: every call is now settled to the neurons Workers AI reports in
// usage.neurons, so estimates only gate the start of a call. Live 19.11
// averages: llama 68, glm-4.7 12, gemma-4-26b 24, glm-5.3 2 per call.
const ESTIMATES = {
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': 70,
  '@cf/zai-org/glm-4.7-flash': 15,
  '@cf/google/gemma-4-26b-a4b-it': 30,
  '@cf/zai-org/glm-5.3-flash': 5,
};
const DEFAULT_ESTIMATE = 80;
export const estimateNeurons = model => ESTIMATES[model] ?? DEFAULT_ESTIMATE;

let tableReady = false;
async function reserve(db, neurons, nowMs) {
  if (!tableReady) {
    await db
      .prepare(
        'CREATE TABLE IF NOT EXISTS ai_daily_neurons(day_utc TEXT PRIMARY KEY,neurons REAL NOT NULL DEFAULT 0,calls INTEGER NOT NULL DEFAULT 0,updated_ms INTEGER NOT NULL)',
      )
      .bind()
      .run();
    tableReady = true;
  }
  const day = new Date(nowMs).toISOString().slice(0, 10);
  // Atomic: the conflict branch only updates while the pool has room.
  const res = await db
    .prepare(
      'INSERT INTO ai_daily_neurons(day_utc,neurons,calls,updated_ms) SELECT ?1,?2,1,?3 WHERE ?2<=?4 ' +
        'ON CONFLICT(day_utc) DO UPDATE SET neurons=neurons+excluded.neurons,calls=calls+1,updated_ms=excluded.updated_ms ' +
        'WHERE ai_daily_neurons.neurons+excluded.neurons<=?4',
    )
    .bind(day, neurons, nowMs, AI_POOL_NEURONS)
    .run();
  return res?.meta?.changes === 1;
}

async function settle(db, delta, nowMs) {
  if (!delta) return;
  const day = new Date(nowMs).toISOString().slice(0, 10);
  await db
    .prepare('UPDATE ai_daily_neurons SET neurons=MAX(0,neurons+?),updated_ms=? WHERE day_utc=?')
    .bind(delta, nowMs, day)
    .run();
}

// Wraps env.AI. Throws ai_global_budget_exhausted before calling the model when
// the pool is spent; a broken ledger fails open (the AI call still happens).
export function meteredAI(ai, db, clock = Date.now) {
  return {
    async run(model, input, opts) {
      let allowed = true;
      try {
        allowed = await reserve(db, estimateNeurons(model), clock());
      } catch {
        allowed = true;
      }
      if (!allowed) throw new Error('ai_global_budget_exhausted');
      // 19.11: the ledger kept the estimate forever (7 055 counted vs ~4 600
      // real by Cloudflare GraphQL): settle to usage.neurons, refund failures.
      const estimate = estimateNeurons(model);
      let out;
      try {
        out = await ai.run(model, input, opts);
      } catch (e) {
        await settle(db, -estimate, clock()).catch(() => {});
        throw e;
      }
      const actual = Number(out?.usage?.neurons);
      if (Number.isFinite(actual) && actual >= 0)
        await settle(db, actual - estimate, clock()).catch(() => {});
      return out;
    },
  };
}
