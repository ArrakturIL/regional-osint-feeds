// B5: importance tiers, tier-first translation queues and the SLA picture.
// Headlines below are real items from the live feed (D1, 17-18.11).
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {newsTier, TIER_SLA_MIN} from '../../backend/editor/src/news/tier.mjs';
import {slaSummary} from '../../backend/editor/src/news/sla.mjs';
import {translateTitles} from '../../backend/editor/src/translations/scheduled.mjs';
import {translateScheduled} from '../../backend/editor/src/localization/scheduled.mjs';
import {readNewsEvents} from '../../backend/editor/src/news/api.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const tier = headline => newsTier({headline, summary: '', source: 'Times of Israel'}).tier;

test('owner SLA minutes per tier', () => {
  assert.deepEqual(TIER_SLA_MIN, {urgent: 15, important: 60, normal: null});
});

test('urgent: kinetic events in the core region and explicit safety signals', () => {
  for (const h of ['Iran targets US military base in Bahrain with drone attack',
    'Israel kills Hamas commander in strike on Gaza camp, officials say',
    'US strikes Iran’s Qeshm Island',
    'פיגוע דריסה ותקיפה בגרזנים ליד יריחו: שלושה ישראלים נפצעו',
    'Home Front Command orders schools closed in the north',
    'Israel closes its airspace as Iran launches missiles',
    'Iran threatens to close the Strait of Hormuz to shipping'.replace('threatens to close', 'closes')])
    assert.equal(tier(h), 'urgent', h);
});

test('not urgent: analysis, threats, plans and non-news', () => {
  for (const h of ['The threat from Isfahan: Iran retains ability to rebuild its nuclear program',
    'US intelligence: Iran plotting dirty bomb or chemical attack in Washington',
    'Iran\'s winter energy crisis deepens as officials fear public unrest',
    'Opinion: why the strike on Gaza changes nothing'])
    assert.notEqual(tier(h), 'urgent', h);
  assert.equal(tier('Opinion: why the strike on Gaza changes nothing'), 'normal');
});

test('important: government and army decisions; normal: the rest', () => {
  assert.equal(tier('Britain sanctions Israeli settlement builders, Gaza aid-blocking activists'), 'important');
  assert.equal(tier('EU sanctions Gaza Now, founder over Hamas financing'), 'important');
  assert.equal(tier('How one Reform synagogue became a test of religious pluralism'), 'normal');
});

// RU queue: five slots per batch go to urgent, then important, then newest normal.
test('RU titles queue takes urgent and important items before newer normal ones', async () => {
  const NOW = Date.parse('2026-11-18T03:00:00Z');
  const row = (id, headline, minutesAgo) => ({id, headline, summary: '', headline_ru: null, discovered_ms: NOW - minutesAgo * 60000, published_ms: NOW - minutesAgo * 60000});
  const rows = [
    ...Array.from({length: 6}, (_, i) => row('normal' + i, 'Basketball coach appointed in Israel ' + i, i)),
    row('urgent', 'Israel kills Hamas commander in strike on Gaza camp, officials say', 30),
    row('important', 'Britain sanctions Israeli settlement builders', 40),
  ];
  const sent = [], latency = [];
  const db = {prepare(sql) {
    let args = [];
    const st = {bind(...a) { args = a; return st; },
      first: async () => ({batches: 0, estimated_neurons: 0}),
      all: async () => ({results: sql.includes('FROM news_items') ? rows : []}),
      run: async () => { if (sql.includes('INTO translation_latency')) latency.push(args); return {meta: {changes: 1}}; }};
    return st;
  }};
  const AI = {async run(model, p) {
    const items = JSON.parse(p.messages[1].content); sent.push(...items.map(x => x.id));
    const ru = {urgent: 'Израиль ликвидировал командира ХАМАС ударом по лагерю в Газе, сообщили официальные лица',
      important: 'Британия ввела санкции против израильских строителей поселений'};
    return {response: JSON.stringify(items.map(x => ({id: x.id, title_ru: ru[x.id] || 'Назначен тренер сборной Израиля по баскетболу'}))), usage: {neurons: 50}};
  }};
  await translateTitles({NEWS_DB: db, AI}, NOW);
  assert.deepEqual(sent.slice(0, 2), ['urgent', 'important']);
  assert.equal(sent.length, 5);
  const urgent = latency.find(a => a[1] === 'urgent');
  assert.deepEqual([urgent[2], urgent[3]], ['ru', 'urgent']);
});

// HE: an urgent item is attempted even on a tick whose cycle kind is not news.
test('HE translator: urgent news gets a lane on every tick', async () => {
  const tick = Date.parse('2026-11-18T03:05:00Z'); // cycle kind for this tick is not 'news'
  const kinds = ['news', 'analyst', 'story', 'editorial', 'news', 'profile'];
  assert.notEqual(kinds[Math.floor(tick / 300000) % 6], 'news');
  const news = [{id: 'u1', headline: 'Israel kills Hamas commander in strike on Gaza camp, officials say', summary: '',
    headline_ru: null, summary_ru: null, comment: null, discovered_ms: tick - 5 * 60000, cached_he_hash: null}];
  const attempted = [];
  const db = {prepare(sql) {
    let args = [];
    const st = {bind(...a) { args = a; return st; },
      first: async () => sql.includes('regional_i18n_budget') ? {attempts: 0, estimated_neurons: 0} : null,
      all: async () => ({results: sql.includes('FROM news_items') ? news : []}),
      run: async () => { if (sql.includes('INTO regional_i18n_attempts')) attempted.push(args[1]); return {meta: {changes: 1}}; }};
    return st;
  }};
  const AI = {async run() { throw Error('model offline in test'); }};
  const state = await translateScheduled({NEWS_DB: db, CORE_DB: db, AI}, tick);
  assert.equal(state.lane, 1);
  assert.deepEqual(attempted, ['u1']);
});

test('SLA summary: translated within/over SLA, waiting and overdue per tier and language', async () => {
  const NOW = Date.parse('2026-11-18T03:00:00Z'), m = 60000;
  const latency = [
    {item_id: 'a', language: 'he', tier: 'urgent', discovered_ms: NOW - 60 * m, shown_ms: NOW - 50 * m},
    {item_id: 'b', language: 'he', tier: 'urgent', discovered_ms: NOW - 60 * m, shown_ms: NOW - 20 * m},
    {item_id: 'c', language: 'ru', tier: 'important', discovered_ms: NOW - 90 * m, shown_ms: NOW - 80 * m},
  ];
  const items = [
    {id: 'w1', headline: 'Israel kills Hamas commander in strike on Gaza camp', summary: '', headline_ru: null, discovered_ms: NOW - 30 * m, he_id: null},
    {id: 'w2', headline: 'Израиль нанёс удар по Газе', summary: '', headline_ru: null, discovered_ms: NOW - 30 * m, he_id: 'w2'},
  ];
  const db = {prepare(sql) {
    const st = {bind() { return st; }, run: async () => ({meta: {changes: 0}}),
      all: async () => ({results: sql.includes('FROM translation_latency') ? latency : items})};
    return st;
  }};
  const s = await slaSummary(db, NOW);
  assert.deepEqual({...s.languages.he.urgent}, {translated: 2, within_sla: 1, p50_min: 40, p90_min: 40, waiting: 1, overdue: 1});
  assert.equal(s.languages.ru.important.within_sla, 1);
  assert.equal(s.languages.ru.urgent.waiting, 1, 'the EN urgent item still needs RU');
  assert.equal(s.languages.ru.urgent.waiting + s.languages.ru.normal.waiting + s.languages.ru.important.waiting, 1,
    'the native RU item needs no RU translation');
});

test('/api/news exposes tier, reason and the stored SLA picture', async () => {
  const now = Date.now();
  const r = {event_id: 'e1', id: 'e1', topic: 'strike', event_priority: 8, priority: 8, last_seen_ms: now, published_ms: now,
    member_count: 1, source_count: 1, origin_count: 1, verification_status: 'single_origin_reporting', sources_json: '[]', reason_codes: '[]',
    source: 'Times of Israel', url: 'https://example.org/e1', headline: 'Israel kills Hamas commander in strike on Gaza camp',
    summary: '', headline_ru: 'Израиль ликвидировал командира ХАМАС в ударе по лагерю в Газе', summary_ru: null, comment: null};
  const sla = {window_hours: 24};
  const db = {prepare(sql) {
    const st = {bind() { return st; }, all: async () => ({results: [r]}),
      first: async () => sql.includes("key='translation_sla'") ? {value: JSON.stringify(sla)} : null};
    return st;
  }};
  const body = await (await readNewsEvents(new Request('https://rw.example/api/news?lang=ru&limit=5&sort=latest'), {NEWS_DB: db})).json();
  assert.equal(body.articles[0].tier, 'urgent');
  assert.equal(body.articles[0].tier_reason, 'strike_core_region');
  assert.deepEqual(body.translation_sla, sla);
});
