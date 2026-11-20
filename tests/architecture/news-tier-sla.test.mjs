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

test('SLA counts only displayed items (translator eligibility)', async () => {
  let sql = '';
  const db = {prepare(q) { if (q.includes('FROM news_items')) sql = q; const st = {bind() { return st; }, run: async () => ({}), all: async () => ({results: []})}; return st; }};
  await slaSummary(db, Date.now());
  assert.match(sql, /n\.priority>=7 OR n\.id IN \(SELECT g\.representative_id FROM news_event_groups g WHERE g\.priority>=4/);
});

// B5 live check 20.11: 17 of 28 items the queue served as urgent were false —
// advocacy and calls ("lobbied for strikes", "urge Iran"), plots, speculation
// in Hebrew ("weighing a strike", "chances of a strike"), retrospectives and
// a strike mentioned only in an "after …" clause. Real attacks stay urgent.
import {readFileSync} from 'node:fs';
const LIVE = JSON.parse(readFileSync(new URL('./fixtures/news-tier-live-20261120.json', import.meta.url), 'utf8')).items;

test('live 18-20.11: real attacks stay urgent, calls, plots, speculation and aftermath do not', () => {
  for (const x of LIVE) {
    const got = newsTier(x);
    assert.equal(got.tier === 'urgent', x.want === 'urgent', `${x.id} ${x.headline} → ${got.tier}/${got.reason}`);
  }
});

test('sirens count only in the headline; advocacy verbs never make a strike', () => {
  const t = (headline, summary = '') => newsTier({headline, summary, source: 'Times of Israel'});
  assert.notEqual(t('Knesset debates new budget', 'Earlier, sirens sounded in the north').reason, 'sirens');
  assert.equal(t('Sirens sound in Tel Aviv as rockets fired from Gaza').tier, 'urgent');
  assert.equal(t('אזעקות בגוש דן: שיגור מתימן').tier, 'urgent');
  for (const h of ['Senator calls for US strikes on Iran nuclear sites', 'Netanyahu urges Trump to back strikes on Iran',
    'Former general warns that Israel should strike Iran now', 'Lobby group advocated for strikes on Hezbollah'])
    assert.notEqual(t(h).tier, 'urgent', h);
});
