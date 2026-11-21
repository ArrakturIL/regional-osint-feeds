// B1: one shared daily Workers AI pool for every Editor pipeline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { meteredAI, AI_POOL_NEURONS, estimateNeurons } from '../../backend/editor/src/ai/budget.mjs';

// Minimal SQLite-like fake for the single budget row the module upserts.
function fakeDb() {
  const rows = new Map();
  const db = {
    rows,
    prepare(sql) {
      return {
        bind(...a) {
          return {
            async run() {
              if (/CREATE TABLE/.test(sql)) return { meta: { changes: 0 } };
              if (/^UPDATE ai_daily_neurons/.test(sql)) {
                const [delta, , d] = a;
                const cur = rows.get(d);
                if (!cur) return { meta: { changes: 0 } };
                cur.neurons = Math.max(0, cur.neurons + delta);
                return { meta: { changes: 1 } };
              }
              const [day, n, now, cap] = a;
              const cur = rows.get(day);
              if (!cur) {
                if (n > cap) return { meta: { changes: 0 } };
                rows.set(day, { neurons: n, calls: 1 });
                return { meta: { changes: 1 } };
              }
              if (cur.neurons + n > cap) return { meta: { changes: 0 } };
              cur.neurons += n;
              cur.calls++;
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return db;
}
const NOW = Date.UTC(2026, 10, 18, 10);
const DAY = '2026-11-18';

test('each AI call is charged to the shared daily pool by model estimate', async () => {
  const db = fakeDb();
  const calls = [];
  const ai = meteredAI(
    {
      run: async m => {
        calls.push(m);
        return { response: 'ok' };
      },
    },
    db,
    () => NOW,
  );
  await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {});
  await ai.run('@cf/zai-org/glm-4.7-flash', {});
  assert.deepEqual(calls.length, 2);
  assert.equal(
    db.rows.get(DAY).neurons,
    estimateNeurons('@cf/meta/llama-3.3-70b-instruct-fp8-fast') +
      estimateNeurons('@cf/zai-org/glm-4.7-flash'),
  );
});

test('exhausted pool refuses before calling the model', async () => {
  const db = fakeDb();
  db.rows.set(DAY, { neurons: AI_POOL_NEURONS - 5, calls: 99 });
  let called = false;
  const ai = meteredAI(
    {
      run: async () => {
        called = true;
      },
    },
    db,
    () => NOW,
  );
  await assert.rejects(ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {}), /ai_global_budget_exhausted/);
  assert.equal(called, false);
});

test('pool stays inside the free 10 000 neurons/day with headroom', () => {
  assert.ok(AI_POOL_NEURONS <= 9000 && AI_POOL_NEURONS >= 8000);
  assert.ok(estimateNeurons('unknown/model') >= estimateNeurons('@cf/meta/llama-3.3-70b-instruct-fp8-fast'));
});

test('budget ledger failure never blocks AI (fail-open, counted later)', async () => {
  const broken = {
    prepare() {
      throw new Error('D1 down');
    },
  };
  const ai = meteredAI({ run: async () => 'x' }, broken, () => NOW);
  assert.equal(await ai.run('@cf/zai-org/glm-4.7-flash', {}), 'x');
});

test('19.11: each call is settled to the neurons Workers AI reports; failed calls are refunded', async () => {
  const db = fakeDb();
  let fail = false;
  const ai = meteredAI(
    {
      run: async () => {
        if (fail) throw Error('8004');
        return { response: 'ok', usage: { neurons: 2.5 } };
      },
    },
    db,
    () => NOW,
  );
  await ai.run('@cf/zai-org/glm-5.3-flash', {});
  assert.equal(db.rows.get(DAY).neurons, 2.5, 'estimate replaced by reported usage');
  await ai.run('@cf/google/gemma-4-26b-a4b-it', {});
  assert.equal(db.rows.get(DAY).neurons, 5);
  fail = true;
  await assert.rejects(ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {}), /8004/);
  assert.equal(db.rows.get(DAY).neurons, 5, 'a failed call costs nothing');
  fail = false;
  await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {}).then(() => {});
  // No usage in the answer → the estimate stays (conservative).
  const noUsage = meteredAI({ run: async () => ({ response: 'ok' }) }, db, () => NOW);
  await noUsage.run('@cf/zai-org/glm-4.7-flash', {});
  assert.equal(db.rows.get(DAY).neurons, 5 + 2.5 + 15);
});
