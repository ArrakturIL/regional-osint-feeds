import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDS } from '../../backend/editor/src/news/events.mjs';
import { scan } from '../../backend/editor/src/news/scan.mjs';
import editor from '../../backend/editor/src/index.js';

function fakeDb({ failGrouping = false, failLastScan = false } = {}) {
  const calls = [];
  function prepare(sql) {
    const stmt = (values = []) => ({
      bind(...args) {
        return stmt(args);
      },
      async all() {
        calls.push({ verb: 'all', sql, args: values });
        if (failGrouping && sql.startsWith('SELECT n.id,n.source,n.headline'))
          throw Error('grouping unavailable');
        return { results: [] };
      },
      async first() {
        calls.push({ verb: 'first', sql, args: values });
        return null;
      },
      async run() {
        calls.push({ verb: 'run', sql, args: values });
        if (failLastScan && sql.includes("VALUES('last_scan'")) throw Error('scan state unavailable');
        return { meta: { changes: 1 } };
      },
    });
    return stmt();
  }
  return {
    db: {
      prepare,
      async batch(statements) {
        calls.push({ verb: 'batch', statements: statements.length });
        return statements.map(() => ({ meta: { changes: 1 } }));
      },
    },
    calls,
  };
}
async function withEmptyRss(action) {
  const original = globalThis.fetch,
    requests = [];
  globalThis.fetch = async url => {
    requests.push(String(url));
    return new Response('<rss version="2.0"><channel></channel></rss>', { status: 200 });
  };
  try {
    return await action(requests);
  } finally {
    globalThis.fetch = original;
  }
}
function makeEnv(options = {}) {
  const news = fakeDb(options),
    core = fakeDb(),
    aiCalls = [];
  return {
    env: {
      NEWS_DB: news.db,
      CORE_DB: core.db,
      AI: {
        async run(...args) {
          aiCalls.push(args);
          throw Error('Unexpected paid AI call');
        },
      },
    },
    calls: news.calls,
    coreCalls: core.calls,
    aiCalls,
  };
}
function has(sql, part) {
  return sql.includes(part);
}
function locate(calls, needle) {
  return calls.findIndex(x => has(x.sql || '', needle));
}

test('successful scan writes exactly one ordered D1 digest and retains unchanged public summary fields', async () => {
  const { env, calls, coreCalls, aiCalls } = makeEnv();
  await withEmptyRss(async requests => {
    const out = await scan(env);
    assert.equal(requests.length, FEEDS.length, 'each of 12 RSS sources checked once');
    assert.equal(out.feeds.length, FEEDS.length);
    assert.ok(
      out.feeds.every(x => x.state === 'empty' && x.http === 200 && x.items === 0 && x.error === null),
    );
    assert.equal(out.found, 0);
    assert.equal(out.inserted, 0);
    assert.equal(out.commented, 0);
    assert.equal(out.comment_errors, 0);
    assert.equal(out.translated, 0);
    assert.equal(out.translated_summaries, 0);
    assert.equal(out.idf_translated, 0);
    assert.equal(out.grouped.input, 0);
    assert.equal(out.grouped.events, 0);
    assert.ok(Number.isFinite(Date.parse(out.updated_at)), 'ISO UTC scan clock retained');
    assert.equal(
      calls.filter(x => x.verb === 'run' && has(x.sql, 'INSERT INTO feed_status')).length,
      FEEDS.length,
    );
    const groups = locate(calls, "VALUES('last_event_filter',");
    const ru = locate(calls, 'INSERT OR IGNORE INTO news_translation_budget(');
    const ai = locate(calls, 'SELECT generation_count,estimated_neurons FROM editor_budget');
    const idf = locate(calls, 'INSERT OR IGNORE INTO official_translation_budget(');
    const saved = locate(calls, "VALUES('last_scan',");
    assert.ok(
      groups > 0 && ru > groups && ai > ru && idf > ai && saved > idf,
      'ingest -> reconcile -> RU -> commentary -> IDF -> digest order unchanged',
    );
    assert.deepEqual(
      JSON.parse(calls[saved].args[0]),
      out,
      'serialized last_scan is exactly the returned summary',
    );
    assert.equal(calls.filter(x => x.verb === 'run' && has(x.sql, "VALUES('last_scan',")).length, 1);
    assert.equal(
      coreCalls.filter(x => x.verb === 'all').length,
      1,
      'IDF original lookup still occurs through CORE_DB',
    );
    assert.equal(aiCalls.length, 0, 'empty scan must not spend an AI generation');
  });
});

test('reconciliation failure is logged, pipeline continues translations and stores a usable error summary', async () => {
  const { env, calls } = makeEnv({ failGrouping: true });
  await withEmptyRss(async () => {
    const out = await scan(env);
    assert.equal(out.grouped.state, 'error');
    assert.match(out.grouped.error, /grouping unavailable/);
    const fail = locate(calls, "VALUES('last_event_filter_error',");
    const ru = locate(calls, 'INSERT OR IGNORE INTO news_translation_budget(');
    const idf = locate(calls, 'INSERT OR IGNORE INTO official_translation_budget(');
    const last = locate(calls, "VALUES('last_scan',");
    assert.ok(
      fail >= 0 && ru > fail && idf > ru && last > idf,
      'reconcile failure does not bypass later stages',
    );
    assert.match(calls[fail].args[0], /grouping unavailable/);
    assert.deepEqual(JSON.parse(calls[last].args[0]), out);
  });
});

test('failed last_scan persistence stays a rejected scheduled job, never a fake success', async () => {
  const { env, calls } = makeEnv({ failLastScan: true });
  await withEmptyRss(async () => {
    await assert.rejects(scan(env), /scan state unavailable/);
    assert.ok(locate(calls, "VALUES('last_scan',") >= 0);
  });
});

test('Worker keeps the five-minute scheduled scan and unchanged last_scan health route', async () => {
  assert.equal(typeof editor.scheduled, 'function');
  const { env } = makeEnv();
  const pending = await editor.fetch(new Request('https://regional-watch.pages.dev/health'), env);
  assert.equal(pending.status, 200);
  assert.deepEqual(await pending.json(), { state: 'pending' });
});
