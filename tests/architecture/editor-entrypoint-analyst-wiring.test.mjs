// E-01 regression: the production entrypoint must hand the Analyst Editor the
// real Worker env, so the private CORE_DB analysts cache is actually consulted.
// Previously index.js passed {DB, AI} only; the cache flag and CORE_DB were lost,
// the reader silently returned null and the frozen GitHub mirror produced
// `mirror_missing_incomplete_or_stale` on every scheduled run.
import test from 'node:test';
import assert from 'node:assert/strict';
import editor from '../../backend/editor/src/index.js';

function fakeDb(log) {
  const stmt = sql => ({
    bind: (...args) => {
      log.push({ sql, args });
      return stmt(sql);
    },
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => ({ meta: { changes: 1 } }),
  });
  return { prepare: sql => stmt(sql), batch: async () => [] };
}

test('scheduled analyst run at :30 reads the analysts cache through CORE_DB', async () => {
  const log = [];
  const db = fakeDb(log);
  const env = {
    CORE_DB: db,
    NEWS_DB: fakeDb([]),
    AI: { run: async () => ({}) },
    REGIONAL_EDITOR_CACHE_SOURCES: 'analysts,news_translation',
  };
  const pending = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 404 });
  try {
    await editor.scheduled({ scheduledTime: Date.UTC(2026, 10, 17, 13, 30) }, env, {
      waitUntil: p => pending.push(Promise.resolve(p)),
    });
    await Promise.allSettled(pending);
  } finally {
    globalThis.fetch = realFetch;
  }
  const analystRun = log.some(x => /analyst_runs/.test(x.sql));
  assert.ok(analystRun, 'analyst editor must use CORE_DB as its DB');
  const cacheRead = log.some(x => /FROM regional_collector_cache/.test(x.sql) && x.args[0] === 'analysts');
  assert.ok(cacheRead, 'analyst editor must consult the private analysts cache');
});
