import test from 'node:test';
import assert from 'node:assert/strict';
import { readApi } from '../../backend/editor/src/analysts/public-api.mjs';
import analystService, { testHooks } from '../../backend/editor/src/analysts/editor.mjs';

const EDITOR_VERSION = 'analyst-editor-v1.1.2-translation';
const request = (path, method = 'GET') => new Request('https://regional-watch.pages.dev' + path, { method });
function makeDb({ health = null, analysts = [], posts = [] } = {}) {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        async first() {
          calls.push({ sql, method: 'first', args: [] });
          if (sql.includes('FROM analyst_runs')) return health;
          throw Error('Unexpected SQL ' + sql);
        },
        bind(...args) {
          return {
            async all() {
              calls.push({ sql, args, method: 'all' });
              if (sql.includes('FROM analyst_publications')) return { results: posts };
              throw Error('Unexpected SQL ' + sql);
            },
          };
        },
        async all() {
          calls.push({ sql, method: 'all', args: [] });
          if (sql.includes('FROM analysts')) return { results: analysts };
          if (sql.includes('FROM analyst_publications')) return { results: posts };
          throw Error('Unexpected SQL ' + sql);
        },
      };
    },
  };
  return { env: { DB: db }, calls };
}

test('health returns last run with same version and CORS; delegation is equivalent', async () => {
  const last = {
    started_at_ms: 123,
    completed_at_ms: 345,
    status: 'partial',
    stats_json: '{"pending_count":3}',
    error_message: 'mirror_fetch_failed',
  };
  const x = makeDb({ health: last });
  const a = await readApi(request('/health'), x.env, EDITOR_VERSION);
  const b = await analystService.fetch(request('/health'), x.env);
  assert.deepEqual(await a.json(), await b.json());
  assert.equal(b.status, 200);
  assert.equal(b.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(b.headers.get('Cache-Control'), 'public, max-age=120');
  const c = makeDb();
  const empty = await readApi(request('/health'), c.env, EDITOR_VERSION);
  assert.equal((await empty.json()).last, null);
});

test('public analyst directory queries only enabled profiles in original display-name order', async () => {
  const f = makeDb({
    analysts: [
      { id: 'a', display_name: 'Первый', description: 'Аналитик' },
      { id: 'b', display_name: 'Второй', description: 'Исследователь' },
    ],
  });
  const res = await analystService.fetch(request('/api/analysts'), f.env);
  const x = await res.json();
  assert.deepEqual(
    x.analysts.map(x => x.id),
    ['a', 'b'],
  );
  assert.equal(x.analysts[1].description, 'Исследователь');
  assert.match(
    f.calls[0].sql,
    /SELECT a\.id,a\.display_name,a\.description,.*AS posts FROM analysts a WHERE a\.enabled=1 ORDER BY a\.display_name/,
  );
  assert.equal(f.calls[0].method, 'all');
});

test('public analyst posts preserve status, exact provenance and bounded pagination SQL', async () => {
  const post = {
    id: 'analyst-report-77',
    headline: 'Аналитик объясняет прогноз',
    summary: 'Заявление автора',
    short_quote: '',
    original_url: 'https://example.org/post/77',
    original_published_at_ms: 1000,
    published_at_ms: 2000,
    source_type: 'telegram_post',
    fact_check_status: 'author_claim_not_independently_verified',
    authorship_status: 'verified_original_channel',
    importance_score: 72,
    status: 'published',
    version: 1,
    editor_version: EDITOR_VERSION,
    analyst: 'Автор',
    original_language: 'ru',
  };
  const f = makeDb({ posts: [post] });
  const res = await readApi(request('/api/analyst-posts?limit=999&offset=99999'), f.env, EDITOR_VERSION);
  const x = await res.json();
  assert.deepEqual(x.posts, [post]);
  assert.match(x.disclaimer, /Attributed analyst interpretations/);
  assert.deepEqual(f.calls[0].args, [41, 2000]); // one extra row = has_more
  assert.match(f.calls[0].sql, /p\.status IN \('published','corrected'\)/);
  assert.match(f.calls[0].sql, /ORDER BY p\.published_at_ms DESC,p\.id DESC LIMIT \? OFFSET \?/);
  const normal = makeDb({ posts: [post] });
  const result = await analystService.fetch(request('/api/analyst-posts'), normal.env);
  assert.equal((await result.json()).posts[0].original_url, post.original_url);
  assert.deepEqual(normal.calls[0].args, [21, 0]);
});

test('post detail returns single row, rejects missing ID and excludes unpublished', async () => {
  const f = makeDb({
    posts: [{ id: 'analyst-report-77', headline: 'Заголовок', original_url: 'https://example.org/source' }],
  });
  const res = await readApi(request('/api/analyst-posts/analyst-report-77'), f.env, EDITOR_VERSION);
  const body = await res.json();
  assert.equal(body.id, 'analyst-report-77');
  assert.equal(body.posts, undefined);
  assert.deepEqual(f.calls[0].args, ['analyst-report-77']);
  assert.match(f.calls[0].sql, /p\.id=\? AND p\.status IN \('published','corrected'\)/);
  const missing = makeDb();
  const notFound = await analystService.fetch(request('/api/analyst-posts/not-here'), missing.env);
  assert.equal(notFound.status, 404);
  assert.deepEqual(await notFound.json(), { error: 'not_found' });
});

test('read-only method and unmatched route never hit D1', async () => {
  const f = makeDb();
  const invalid = await analystService.fetch(request('/api/analyst-posts', 'POST'), f.env);
  assert.equal(invalid.status, 405);
  assert.deepEqual(await invalid.json(), { error: 'read_only' });
  const unknown = await readApi(request('/api/unknown'), f.env, EDITOR_VERSION);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: 'not_found' });
  assert.equal(f.calls.length, 0);
});

// 22.11: author filter, search over all publications (Cyrillic case), next page.
import { d1 } from './editor-d1-fixture.mjs';
test('posts: filter by author, search any case, has_more', async () => {
  const db = d1();
  db.raw.exec(`
CREATE TABLE analysts (id TEXT PRIMARY KEY, display_name TEXT, description TEXT, enabled INTEGER);
CREATE TABLE analyst_sources (id TEXT PRIMARY KEY, language TEXT);
CREATE TABLE analyst_items (id TEXT PRIMARY KEY, source_id TEXT);
CREATE TABLE analyst_publications (id TEXT PRIMARY KEY, analyst_id TEXT, item_id TEXT, headline TEXT, summary TEXT, short_quote TEXT,
  original_url TEXT, original_published_at_ms INTEGER, published_at_ms INTEGER, source_type TEXT, fact_check_status TEXT,
  authorship_status TEXT, importance_score INTEGER, status TEXT, version INTEGER, editor_version TEXT);
INSERT INTO analysts VALUES ('dina','«Война и мир на Ближнем Востоке»','d',1),('abu','Абу Али Экспресс','a',1);
INSERT INTO analyst_sources VALUES ('s','ru');
`);
  for (let i = 0; i < 5; i++) {
    const who = i < 3 ? 'abu' : 'dina';
    db.raw.exec(`INSERT INTO analyst_items VALUES ('i${i}','s')`);
    db.raw
      .prepare(
        `INSERT INTO analyst_publications VALUES (?,?,?,?,?,'', 'https://x', 1, ?, 'telegram','unverified','attributed',1,'published',1,'v')`,
      )
      .run('p' + i, who, 'i' + i, i === 4 ? 'Иран и Залив' : 'Заголовок ' + i, 'текст', 1000 + i);
  }
  const get = async q => (await readApi(request('/api/analyst-posts' + q), { DB: db })).json();
  const byAuthor = await get('?author=dina');
  assert.deepEqual(
    byAuthor.posts.map(p => p.id),
    ['p4', 'p3'],
  );
  assert.equal(byAuthor.has_more, false);
  assert.deepEqual(
    (await get('?q=иран')).posts.map(p => p.id),
    ['p4'],
  );
  assert.deepEqual((await get('?q=50%25')).posts, []);
  const page = await get('?limit=2');
  assert.equal(page.posts.length, 2);
  assert.equal(page.has_more, true);
  assert.equal((await get('?limit=2&offset=4')).has_more, false);
  const people = await (await readApi(request('/api/analysts'), { DB: db })).json();
  assert.deepEqual(
    people.analysts.map(a => [a.id, a.posts]),
    [
      ['dina', 2],
      ['abu', 3],
    ],
  );
});
