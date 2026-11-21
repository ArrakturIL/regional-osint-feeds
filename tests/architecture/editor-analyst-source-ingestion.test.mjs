import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { createSourceIngestion } from '../../backend/editor/src/analysts/source-ingestion.mjs';
import analystService, { testHooks } from '../../backend/editor/src/analysts/editor.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const HOUR = 3_600_000,
  DAY = 24 * HOUR,
  now = Date.parse('2026-11-16T02:00:00Z');
const plain = (text, cap) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, cap);
const assertString = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
const create = () => createSourceIngestion({ HOUR, DAY, plain, assertString });
const source = {
  id: 'src-one',
  analyst_id: 'analyst-one',
  type: 'telegram_public',
  language: 'ru',
  canonical_prefix: 'https://t.me/analyst_one/',
};
const analyst = { id: 'analyst-one' };
function item(overrides = {}) {
  return {
    id: 'src-one:123',
    source_id: source.id,
    analyst_id: analyst.id,
    canonical_url: 'https://t.me/analyst_one/123',
    type: 'telegram_post',
    published_at: new Date(now - 30_000).toISOString(),
    language: 'ru',
    text_status: 'full_text',
    title: 'Оригинальный заголовок',
    body: 'Точный оригинальный текст публикации',
    content_hash: 'a'.repeat(64),
    ...overrides,
  };
}
test('strict Telegram source validation retains original text, author and UTC date', () => {
  const { validateInput } = create();
  const got = validateInput(item(), source, analyst, now);
  assert.equal(got.id, 'src-one:123');
  assert.equal(got.canonical_url, 'https://t.me/analyst_one/123');
  assert.equal(got.published_at_ms, now - 30_000);
  assert.equal(got.original_language, 'ru');
  assert.equal(got.text_status, 'full_text');
  assert.equal(got.content_hash, 'a'.repeat(64));
  assert.equal(testHooks.validateInput(item(), source, analyst, now).id, got.id);
});
test('rejects false source/analyst identities, forged Telegram paths, invalid state/hash/age and oversized body', () => {
  const { validateInput } = create();
  for (const changes of [
    { id: 'other:123' },
    { source_id: 'other' },
    { analyst_id: 'other' },
    { canonical_url: 'https://evil.org/analyst_one/123' },
    { canonical_url: 'https://t.me/analyst_one/not-numeric' },
    { type: 'youtube_video' },
    { language: 'en' },
    { text_status: 'unknown' },
    { content_hash: '123' },
    { content_hash: 'Z'.repeat(64) },
    { published_at: new Date(now - 8 * DAY).toISOString() },
    { published_at: new Date(now + 4 * HOUR).toISOString() },
    { body: 'x'.repeat(6501) },
    { body: '\u0000 bad' },
    { text_status: 'full_text', body: 'x' },
  ]) {
    assert.equal(
      validateInput(item(changes), source, analyst, now),
      null,
      JSON.stringify(changes).slice(0, 100),
    );
  }
});
test('YouTube videos are metadata_only without fabricated transcripts', () => {
  const { validateInput } = create();
  const yt = {
    id: 'src-video',
    analyst_id: 'analyst-one',
    type: 'youtube_rss',
    language: 'en',
    canonical_prefix: 'https://www.youtube.com/watch?v=',
  };
  const video = {
    ...item(),
    id: 'src-video:abc123',
    source_id: 'src-video',
    type: 'youtube_video',
    canonical_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    language: 'en',
    text_status: 'metadata_only',
    body: '',
  };
  const got = validateInput(video, yt, analyst, now);
  assert.equal(got.original_language, 'en');
  assert.equal(got.body, '');
  assert.equal(
    validateInput({ ...video, body: 'Unverified invented video transcript' }, yt, analyst, now),
    null,
  );
  assert.equal(
    validateInput({ ...video, text_status: 'full_text', body: 'some text' }, yt, analyst, now),
    null,
  );
});
test('source hash uses original SHA256, not a fabricated or AI content hash', async () => {
  const { sha256 } = create();
  const body = 'Some original text with numbers 2026';
  assert.equal(await sha256(body), createHash('sha256').update(body).digest('hex'));
  assert.notEqual(await sha256(body), await sha256(body + ' changed'));
});
test('mirror reader rejects unlisted paths and HTTP 403, accepts valid JSON, refuses oversize bytes', async () => {
  const { readMirror } = create();
  const old = globalThis.fetch;
  const called = [];
  try {
    globalThis.fetch = async url => {
      called.push(url);
      return new Response('{"schema_version":1,"items":[]}', { status: 200 });
    };
    await assert.rejects(readMirror('../../credentials'), /invalid mirror path/);
    assert.equal(called.length, 0);
    assert.deepEqual(await readMirror('analyst-source-items.json'), { schema_version: 1, items: [] });
    assert.equal(
      called[0],
      'https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/analyst-source-items.json',
    );
    globalThis.fetch = async () => new Response('forbidden', { status: 403 });
    await assert.rejects(readMirror('analyst-source-status.json'), /mirror_http_403/);
    globalThis.fetch = async () => new Response('x'.repeat(135001), { status: 200 });
    await assert.rejects(readMirror('analyst-source-items.json'), /mirror_oversized/);
    globalThis.fetch = async () => new Response('not JSON', { status: 200 });
    await assert.rejects(readMirror('analyst-source-items.json'), /SyntaxError/);
  } finally {
    globalThis.fetch = old;
  }
});
test('D1 ingestion retains insert-or-ignore, revision capture and published source-changed guard', async () => {
  const { insertItem } = create();
  const ops = [];
  const it = {
    id: 'src-one:123',
    analyst_id: 'analyst-one',
    source_id: 'src-one',
    canonical_url: 'https://t.me/analyst_one/123',
    type: 'telegram_post',
    published_at_ms: now - 1000,
    title: 'Заголовок',
    body: 'Текст',
    text_status: 'full_text',
    content_hash: 'a'.repeat(64),
  };
  function db({ newItem, existing }) {
    return {
      prepare(sql) {
        let args = [];
        return {
          bind(...xs) {
            args = xs;
            return this;
          },
          async run() {
            ops.push({ sql, args, method: 'run' });
            return {
              meta: { changes: sql.includes('INSERT OR IGNORE INTO analyst_items') ? (newItem ? 1 : 0) : 1 },
            };
          },
          async first() {
            ops.push({ sql, args, method: 'first' });
            return existing;
          },
        };
      },
    };
  }
  assert.equal(
    await insertItem(
      db({ newItem: true, existing: { content_hash: it.content_hash, state: 'pending' } }),
      it,
      now,
    ),
    true,
  );
  assert.ok(ops.some(o => o.sql.includes('INSERT OR IGNORE INTO analyst_item_revisions')));
  assert.ok(!ops.some(o => o.sql.includes("state='source_changed'")));
  ops.length = 0;
  assert.equal(
    await insertItem(
      db({ newItem: false, existing: { content_hash: 'b'.repeat(64), state: 'published' } }),
      it,
      now,
    ),
    false,
  );
  assert.ok(ops.some(o => o.sql.includes("state='source_changed'") && o.args[0] === it.id));
  assert.ok(ops.some(o => o.sql.includes("state='pending'") && o.args.includes(it.content_hash)));
  assert.ok(ops.some(o => o.sql.includes('analyst_item_revisions')));
});
