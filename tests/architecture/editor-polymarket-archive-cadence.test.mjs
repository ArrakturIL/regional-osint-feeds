// D1 budget (19.11): the expired-Polymarket archive scanned every polymarket row twice
// on each 5-minute Editor tick (~720k rows read/day). /api/data already drops expired
// markets itself (marketSnapshots: end <= now), so the archive runs once an hour at :20.
import test from 'node:test';
import assert from 'node:assert/strict';
import editor from '../../backend/editor/src/index.js';

function fakeDb(log) {
  const stmt = sql => ({
    bind: (...args) => { log.push(sql); return stmt(sql); },
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => { log.push(sql); return { meta: { changes: 0 } }; },
  });
  return { prepare: sql => stmt(sql), batch: async items => { items.forEach(() => log.push('batch')); return []; } };
}
async function tick(minute) {
  const core = [];
  const env = { CORE_DB: fakeDb(core), NEWS_DB: fakeDb([]), AI: { run: async () => ({}) } };
  const pending = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 404 });
  try {
    await editor.scheduled({ scheduledTime: Date.UTC(2026, 10, 19, 3, minute) }, env, { waitUntil: p => pending.push(Promise.resolve(p)) });
    await Promise.allSettled(pending);
  } finally {
    globalThis.fetch = realFetch;
  }
  return core.some(sql => sql.includes('expired_polymarket_observations'));
}
test('expired Polymarket archive runs on the :20 tick', async () => {
  assert.equal(await tick(20), true);
});
test('expired Polymarket archive does not run on other 5-minute ticks', async () => {
  for (const m of [0, 5, 15, 25, 30, 55]) assert.equal(await tick(m), false, 'minute ' + m);
});
