import test from 'node:test';
import assert from 'node:assert/strict';
import editor from '../../backend/editor/src/index.js';
import { readOfficialPosts } from '../../backend/editor/src/api/official-posts.mjs';

const observed = Date.parse('2026-11-15T18:30:00.000Z');
const raw = {
  url: 'https://t.me/idfofficial/123456',
  title: 'IDF reports 12 alerts &amp; 3 interceptions',
  excerpt:
    'IDF reports 12 alerts and 3 interceptions across northern Israel today. All relevant authorities are responding to the incident.',
  published_at: '2026-11-15T18:00:00.000Z',
};
const translated = {
  url: raw.url,
  title_ru: 'ЦАХАЛ сообщил о 12 тревогах и 3 перехватах',
  excerpt_ru:
    'ЦАХАЛ сообщил о 12 тревогах и 3 перехватах на севере Израиля. Соответствующие службы реагируют на происшествие.',
  model: 'Llama 3.3 70B',
  translated_ms: observed + 2000,
};

function fixture({
  posts = [{ id: 'official-123456', observed_at: observed, payload: JSON.stringify(raw) }],
  translations = [translated],
} = {}) {
  const calls = [];
  const query = (table, rows) => ({
    prepare(sql) {
      const q = {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async all() {
          calls.push({ table, sql, args: q.args });
          assert.match(sql, table === 'CORE_DB' ? /FROM observations o/ : /FROM official_translations/);
          return { results: rows };
        },
        async first() {
          throw Error('Unexpected first() on read-only official posts API');
        },
        async run() {
          throw Error('API must not mutate D1');
        },
        async batch() {
          throw Error('API must not mutate D1');
        },
      };
      return q;
    },
  });
  return { env: { CORE_DB: query('CORE_DB', posts), NEWS_DB: query('NEWS_DB', translations) }, calls };
}
const request = (query = '') => new Request('https://regional-watch.example/api/official-posts' + query);
const body = async res => ({
  status: res.status,
  cors: res.headers.get('Access-Control-Allow-Origin'),
  cache: res.headers.get('Cache-Control'),
  json: await res.json(),
});

test('invalid RU/HE query and limit are rejected before any DB access', async () => {
  const { env, calls } = fixture();
  for (const query of ['?lang=fr', '?limit=0', '?limit=11', '?limit=1.5', '?limit=NaN']) {
    const out = await body(await readOfficialPosts(request(query), env));
    assert.equal(out.status, 400, query);
    assert.deepEqual(out.json, { error: 'invalid_request' }, query);
    assert.equal(out.cors, '*', query);
  }
  assert.equal(calls.length, 0);
});

test('RU returns validated numeric-preserving translation and original attribution', async () => {
  const { env, calls } = fixture();
  const res = await readOfficialPosts(request('?lang=ru&limit=1'), env),
    out = await body(res);
  assert.equal(out.status, 200);
  assert.equal(out.cache, 'public,max-age=60');
  assert.equal(out.json.requested_language, 'ru');
  assert.equal(out.json.total, 1);
  assert.equal(out.json.items.length, 1);
  const item = out.json.items[0];
  assert.equal(item.url, raw.url);
  assert.equal(item.content_language, 'ru');
  assert.deepEqual(item.field_languages, { title: 'ru', description: 'ru' });
  assert.equal(item.title, translated.title_ru);
  assert.equal(item.description, 'на севере Израиля. Соответствующие службы реагируют на происшествие.');
  assert.equal(
    item.title + ' ' + item.description,
    translated.excerpt_ru,
    'existing headline/description deduplication stays intact',
  );
  assert.equal(item.original_title, 'IDF reports 12 alerts & 3 interceptions');
  assert.equal(item.original_description, raw.excerpt);
  assert.equal(item.translation_status, 'available');
  assert.equal(item.translation_verified, false);
  assert.equal(item.translation_model, 'Llama 3.3 70B');
  assert.equal(item.source_type, 'official_idf_telegram');
  assert.equal(item.source_language, 'en');
  assert.equal(item.published, raw.published_at);
  assert.equal(item.observed, new Date(observed).toISOString());
  assert.equal(calls.length, 2);
  assert.equal(calls[0].table, 'CORE_DB');
  assert.deepEqual(calls[0].args, [20]);
  assert.equal(calls[1].table, 'NEWS_DB');
  assert.deepEqual(calls[1].args, [raw.url]);
});

test('missing facts in Russian translation trigger original English text and needs_review', async () => {
  const broken = { ...translated, excerpt_ru: 'ЦАХАЛ сообщил о тревогах и перехватах на севере Израиля.' };
  const { env } = fixture({ translations: [broken] });
  const { json } = await body(await readOfficialPosts(request('?lang=ru'), env));
  const item = json.items[0];
  assert.equal(item.translation_status, 'needs_review');
  assert.equal(item.content_language, 'en');
  assert.deepEqual(item.field_languages, { title: 'en', description: 'en' });
  assert.equal(item.translation_verified, false);
  assert.equal(item.translation_model, null);
  assert.equal(item.title, 'IDF reports 12 alerts & 3 interceptions');
  assert.equal(item.description, raw.excerpt);
});

test('HE request retains source-language fallback rather than inventing Hebrew content', async () => {
  const { env } = fixture();
  const { json } = await body(await readOfficialPosts(request('?lang=he'), env));
  assert.equal(json.requested_language, 'he');
  const item = json.items[0];
  assert.equal(item.content_language, 'en');
  assert.equal(item.title, 'IDF reports 12 alerts & 3 interceptions');
  assert.equal(item.translation_status, 'pending');
  assert.equal(item.translation_verified, false);
  assert.equal(item.translation_model, null);
});

test('untrusted Telegram URLs, malformed rows and repeated IDs are excluded', async () => {
  const other = { ...raw, url: 'https://t.me/someone_else/123456' };
  const duplicate = { ...raw, title: 'Old duplicate should be excluded' };
  const { env, calls } = fixture({
    posts: [
      { id: 'bad-json', observed_at: observed, payload: '{' },
      { id: 'other', observed_at: observed, payload: JSON.stringify(other) },
      { id: 'official-123456', observed_at: observed, payload: JSON.stringify(raw) },
      { id: 'official-123456', observed_at: observed - 9000, payload: JSON.stringify(duplicate) },
    ],
  });
  const out = await body(await readOfficialPosts(request('?limit=3'), env));
  assert.equal(out.json.total, 1);
  assert.equal(out.json.items[0].title, translated.title_ru);
  assert.equal(out.json.items[0].url, raw.url);
  assert.deepEqual(calls[0].args, [20]);
});

test('actual Editor fetch entrypoint still routes official posts without changing payload', async () => {
  const { env } = fixture();
  const { json, status } = await body(await editor.fetch(request('?lang=ru&limit=1'), env));
  assert.equal(status, 200);
  assert.equal(json.items.length, 1);
  assert.equal(json.items[0].translation_status, 'available');
});
