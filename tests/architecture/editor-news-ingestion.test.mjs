import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDS } from '../../backend/editor/src/news/events.mjs';
import { ingestNewsFeeds } from '../../backend/editor/src/news/ingestion.mjs';

const NOW = Date.parse('2026-11-16T02:00:00Z');
const WHEN = new Date(NOW - 3600000).toUTCString();
const item = (title, url, pub = WHEN) =>
  '<item><title>' +
  title +
  '</title><link>' +
  url +
  '</link><pubDate>' +
  pub +
  '</pubDate><description>Israel Iran regional security developments and diplomatic discussions</description></item>';
const rss = (items = []) => '<rss version="2.0"><channel>' + items.join('') + '</channel></rss>';
const db = (knownUrls = [], controls = null) => {
  const queries = [],
    writes = [];
  const NEWS_DB = {
    prepare(sql) {
      const stmt = (args = []) => ({
        bind(...values) {
          return stmt(values);
        },
        all: async () => {
          queries.push({ method: 'all', sql, args });
          if (sql.includes('FROM news_items WHERE published_ms>=?'))
            return { results: knownUrls.map(url => ({ url })) };
          if (controls && sql.includes('FROM source_controls'))
            return { results: controls.map(source => ({ source })) };
          throw Error('Unexpected all query: ' + sql);
        },
        run: async () => {
          writes.push({ sql, args });
          if (sql.includes('INSERT OR IGNORE INTO news_items')) return { meta: { changes: 1 } };
          if (sql.includes('INSERT INTO feed_status') || sql.includes('DELETE FROM news_items'))
            return { meta: { changes: 1 } };
          throw Error('Unexpected run query: ' + sql);
        },
      });
      return stmt();
    },
  };
  return { NEWS_DB, queries, writes };
};
async function withFeeds(respond, check) {
  const old = globalThis.fetch,
    calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    return respond(String(url), calls.length);
  };
  try {
    return await check(calls);
  } finally {
    globalThis.fetch = old;
  }
}
const byName = source => FEEDS.find(f => f[0] === source)?.[1];

test('feed status writes all 12 source outcomes and keeps independent publisher articles', async () => {
  const { NEWS_DB, queries, writes } = db();
  const title = 'Israel and Iran hold regional security talks';
  const result = await withFeeds(
    url => {
      if (url === byName('Al Jazeera')) return new Response('Unavailable', { status: 503 });
      if (url === byName('BBC Middle East'))
        return new Response(
          rss([
            item(title, 'https://example.net/report/1?utm_source=rss&x=2'),
            item(title, 'https://example.net/report/1?x=2&utm_campaign=feed'),
            item(title, 'https://example.net/report/2'),
          ]),
          { status: 200 },
        );
      if (url === byName('Times of Israel'))
        return new Response(rss([item(title, 'https://example.net/report/3')]), { status: 200 });
      return new Response(rss(), { status: 200 });
    },
    async calls => {
      const result = await ingestNewsFeeds({ NEWS_DB }, NOW);
      assert.equal(calls.length, FEEDS.length, 'exactly one fetch for each declared source');
      return result;
    },
  );
  assert.equal(result.runs.length, FEEDS.length);
  assert.equal(result.inserted, 2, 'one BBC and one independent ToI story');
  assert.equal(result.all.length, 4, 'raw candidate items remain available for scan summary');
  const statuses = writes.filter(w => w.sql.includes('INSERT INTO feed_status'));
  assert.equal(statuses.length, FEEDS.length);
  assert.deepEqual(statuses.find(w => w.args[0] === 'Al Jazeera').args.slice(1, 4), [NOW, 'error', 503]);
  assert.equal(statuses.find(w => w.args[0] === 'BBC Middle East').args[2], 'ok');
  assert.equal(statuses.find(w => w.args[0] === 'JNS').args[2], 'empty');
  const inserted = writes.filter(w => w.sql.includes('INSERT OR IGNORE INTO news_items'));
  assert.equal(inserted.length, 2);
  assert.deepEqual(new Set(inserted.map(w => w.args[1])), new Set(['BBC Middle East', 'Times of Israel']));
  assert.match(
    inserted.find(w => w.args[1] === 'BBC Middle East').args[4],
    /utm_source=rss/,
    'store source URL, not canonical replacement',
  );
  assert.equal(queries.filter(q => q.sql.includes('FROM news_items WHERE published_ms>=?')).length, 1);
  const purge = writes.find(w => w.sql.includes('DELETE FROM news_items'));
  assert.deepEqual(purge.args, [NOW - 8 * 86400000]);
});

test('known canonical identity prevents insert even if UTM order changed', async () => {
  const { NEWS_DB, writes } = db(['https://example.net/known?a=1&z=9']);
  const result = await withFeeds(
    url =>
      url === byName('BBC Middle East')
        ? new Response(
            rss([
              item(
                'Israel Iran officials discuss security',
                'https://example.net/known?z=9&utm_medium=rss&a=1',
              ),
            ]),
            { status: 200 },
          )
        : new Response(rss(), { status: 200 }),
    async () => ingestNewsFeeds({ NEWS_DB }, NOW),
  );
  assert.equal(result.inserted, 0);
  assert.equal(result.all.length, 1);
  assert.equal(writes.filter(w => w.sql.includes('INSERT OR IGNORE INTO news_items')).length, 0);
});

test('feed intake is capped at 240 sorted candidates even when more pass RSS parsing', async () => {
  const { NEWS_DB, writes } = db();
  const feeds = new Set(FEEDS.slice(0, 4).map(x => x[1]));
  const result = await withFeeds(
    url => {
      if (!feeds.has(url)) return new Response(rss(), { status: 200 });
      const label = FEEDS.find(f => f[1] === url)?.[0].replace(/[^A-Za-z]/g, '') || 'news';
      const items = Array.from({ length: 75 }, (_, i) =>
        item(
          'Israel and Iran security agreement number ' + i,
          'https://example.net/' + label + '/' + i,
          new Date(NOW - 3600000 - i * 60000).toUTCString(),
        ),
      );
      return new Response(rss(items), { status: 200 });
    },
    async () => ingestNewsFeeds({ NEWS_DB }, NOW),
  );
  assert.equal(result.all.length, 300);
  assert.equal(result.inserted, 240);
  assert.equal(writes.filter(w => w.sql.includes('INSERT OR IGNORE INTO news_items')).length, 240);
  assert.equal(writes.filter(w => w.sql.includes('DELETE FROM news_items')).length, 1);
});

test('failed source-status persistence stops ingestion before article writes', async () => {
  const writes = [];
  const NEWS_DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            run: async () => {
              writes.push({ sql, args });
              throw Error('D1 unavailable');
            },
          };
        },
      };
    },
  };
  await withFeeds(
    () => new Response(rss(), { status: 200 }),
    async () => {
      await assert.rejects(ingestNewsFeeds({ NEWS_DB }, NOW), /D1 unavailable/);
    },
  );
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /INSERT INTO feed_status/);
});

// H-04: one publisher is rolled back through D1 source_controls, without a release.
test('a disabled publisher is not fetched, gets status=disabled, and other feeds still ingest', async () => {
  const { NEWS_DB, writes } = db([], ['jpost']);
  const jpost = FEEDS.filter(f => f[2] === 'jpost').map(f => f[1]);
  assert.equal(jpost.length, 2, 'jpost has two feeds; one control covers both');
  await withFeeds(
    url => new Response(rss([item('Israel Iran security talks continue', url + '/a')]), { status: 200 }),
    async calls => {
      await ingestNewsFeeds({ NEWS_DB }, NOW);
      assert.equal(calls.length, FEEDS.length - 2);
      assert.ok(!calls.some(u => jpost.includes(u)));
    },
  );
  const st = writes.filter(w => w.sql.includes('INSERT INTO feed_status'));
  assert.equal(st.length, FEEDS.length, 'every feed still has a truthful status row');
  for (const name of FEEDS.filter(f => f[2] === 'jpost').map(f => f[0]))
    assert.deepEqual(st.find(w => w.args[0] === name).args.slice(2, 5), ['disabled', null, 0]);
  assert.ok(
    !writes.some(
      w =>
        w.sql.includes('INSERT OR IGNORE INTO news_items') && String(w.args[1]).startsWith('Jerusalem Post'),
    ),
  );
});

test('21.11: a publication time in the future is clamped to the moment of discovery', async () => {
  const { NEWS_DB, writes } = db();
  const ahead = new Date(NOW + 9 * 60000).toUTCString();
  await withFeeds(
    url =>
      url === byName('Times of Israel')
        ? new Response(
            rss([item('Israel and Iran regional talks resume', 'https://example.net/future', ahead)]),
            {
              status: 200,
            },
          )
        : new Response(rss(), { status: 200 }),
    () => ingestNewsFeeds({ NEWS_DB }, NOW),
  );
  const insert = writes.find(w => w.sql.includes('INSERT OR IGNORE INTO news_items'));
  assert.ok(insert, 'the item was stored');
  assert.equal(insert.args[5], NOW, 'published_ms is not later than discovered_ms');
  assert.equal(insert.args[6], NOW);
});

test('a rewritten headline on a known URL is retranslated once; old items and A/B flips are left alone', async () => {
  const { newsDb, addNews } = await import('./editor-d1-fixture.mjs');
  const db = newsDb();
  db.raw.exec(
    'CREATE TABLE feed_status(name TEXT PRIMARY KEY,checked_ms INTEGER,status TEXT,http_status INTEGER,items_count INTEGER,error TEXT)',
  );
  const url = 'https://www.maariv.co.il/news/1';
  addNews(db, {
    id: 'm1',
    source: 'Maariv',
    url,
    headline: 'You will not believe what happened',
    headline_ru: 'Вы не поверите',
    summary_ru: 'x',
    summary: 'old summary',
    published_ms: NOW - 2 * 3600000,
  });
  addNews(db, {
    id: 'old',
    url: 'https://www.maariv.co.il/news/2',
    headline: 'Old headline',
    headline_ru: 'Старый',
    published_ms: NOW - 30 * 3600000,
  });
  const feed = titles =>
    rss([
      item(titles[0], url),
      item(titles[1], 'https://www.maariv.co.il/news/2', new Date(NOW - 30 * 3600000).toUTCString()),
    ]);
  const run = titles =>
    withFeeds(
      u => new Response(u === byName('Times of Israel') ? feed(titles) : rss(), { status: 200 }),
      () => ingestNewsFeeds({ NEWS_DB: db }, NOW),
    );
  const first = await run(['Israel on the way to a deal with Greece', 'Old headline rewritten']);
  assert.equal(first.retitled, 1);
  const row = db.raw
    .prepare('SELECT headline,headline_ru,summary_ru,summary FROM news_items WHERE id=?')
    .get('m1');
  assert.equal(row.headline, 'Israel on the way to a deal with Greece');
  assert.equal(row.headline_ru, null, 'RU cleared, so the RU translator picks it up again');
  assert.equal(row.summary, 'Israel Iran regional security developments and diplomatic discussions');
  assert.equal(
    db.raw.prepare('SELECT headline_ru FROM news_items WHERE id=?').get('old').headline_ru,
    'Старый',
  );
  // Same headline again with punctuation only: nothing. A flip back: no second rewrite.
  assert.equal((await run(['Israel on the way to a deal with Greece!', 'Old headline'])).retitled, 0);
  assert.equal((await run(['You will not believe what happened', 'Old headline'])).retitled, 0);
  assert.equal(
    db.raw.prepare('SELECT headline FROM news_items WHERE id=?').get('m1').headline,
    'Israel on the way to a deal with Greece',
  );
});
