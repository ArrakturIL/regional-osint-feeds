// H-04: a rolled-back publisher disappears from the public /api/news feed
// immediately, without a release; other publishers are unaffected.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {readNewsEvents} from '../../backend/editor/src/news/api.mjs';
import {FEEDS} from '../../backend/editor/src/news/events.mjs';
import {sources} from '../../backend/monitor/src/schedule/sources.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const now = Date.now();
const row = (id, source, headline) => ({
  event_id: id, id, topic: 'military', event_priority: 8, priority: 8, last_seen_ms: now - 60000, published_ms: now - 60000,
  member_count: 1, source_count: 1, origin_count: 1, verification_status: 'single_origin_reporting',
  sources_json: '[]', reason_codes: '[]', source, url: 'https://example.org/' + id,
  headline, summary: '', headline_ru: null, summary_ru: null, comment: null,
  he_hash: null, he_title: null, he_body: null, he_comment: null, he_quality: null,
});
const ROWS = [row('toi-1', 'Times of Israel', 'IDF strikes in Gaza'), row('bbc-1', 'BBC Middle East', 'Talks resume in Cairo')];
const db = controls => ({prepare(sql) {
  const ok = {bind() { return this; }, all: async () => ({results: ROWS}), first: async () => null};
  if (sql.includes('FROM source_controls')) return {bind() { return this; }, all: async () => {
    if (controls === 'fail') throw Error('no such table: source_controls');
    return {results: controls.map(source => ({source}))};
  }};
  if (sql.includes('news_event_groups') || sql.includes('FROM news_items') || sql.includes('regional_i18n')) return ok;
  throw Error('unexpected SQL ' + sql.slice(0, 80));
}});
const ids = async controls => {
  const r = await readNewsEvents(new Request('https://rw.example/api/news?lang=ru&limit=10&sort=latest'), {NEWS_DB: db(controls)});
  assert.equal(r.status, 200);
  return (await r.json()).articles.map(x => x.event_id || x.id).sort();
};

test('no controls: both publishers are public', async () => {
  assert.deepEqual(await ids([]), ['bbc-1', 'toi-1']);
});
test('disabled publisher is hidden, the other stays', async () => {
  assert.deepEqual(await ids(['toi']), ['bbc-1']);
});
test('control table missing fails open', async () => {
  assert.deepEqual(await ids('fail'), ['bbc-1', 'toi-1']);
});
test('operator config lists exactly the keys each worker understands', () => {
  const cfg = JSON.parse(readFileSync(new URL('../../config/source-controls.json', import.meta.url), 'utf8'));
  assert.deepEqual(cfg.components.monitor.sources, sources.map(s => s.name).sort());
  assert.deepEqual(cfg.components.editor.sources, [...new Set(FEEDS.map(f => f[2]))].sort());
});
test('Pages keeps the disabled state and reason instead of reporting unknown', async () => {
  const {assembleSources} = await import('../../backend/pages/src/api/sources.js');
  const [s] = assembleSources([{source: 'mil_lol', state: 'disabled', detail: 'adsb.fi 403', attempted_at: now, succeeded_at: now - 3600000}]);
  assert.equal(s.state, 'disabled');
  assert.equal(s.description, 'adsb.fi 403');
});
