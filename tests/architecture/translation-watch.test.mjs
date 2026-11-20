// B12 (20.11): RU/HE stall alerts and the archive re-check through today's
// gates. Real queue SQL on SQLite (node:sqlite) behind the D1 API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newsDb, coreDb, addNews, ai } from './editor-d1-fixture.mjs';
import { enqueueJobs, settleJob } from '../../backend/editor/src/translations/jobs.mjs';
import { translationAlerts, recheckArchive, translationWatch, ALERT, ARCHIVE } from '../../backend/editor/src/translations/watch.mjs';
import { translateTitles } from '../../backend/editor/src/translations/scheduled.mjs';
import { meaningCheck } from '../../backend/editor/src/translations/meaning-check.mjs';
import { fingerprint, sourceText } from '../../backend/editor/src/localization/shared.mjs';

const MIN = 60000,
  HOUR = 60 * MIN;
const T0 = Date.parse('2026-11-20T12:00:00Z');
const LANES = ['ru', 'he_news', 'he_core'];
const atLane = (name, base = T0) => {
  let t = base;
  while (LANES[Math.floor(t / 300000) % 3] !== name) t += 300000;
  return t;
};
const state = (db, key) => JSON.parse(db.one('SELECT value FROM editor_state WHERE key=?', key)?.value || 'null');
const job = (id, language, tier, createdAt) => ({ kind: 'news', id, language, sourceHash: 'h-' + id, tier, discoveredMs: createdAt });

// ---------- (a) alerts ----------
test('alert: an urgent/important job pending over an hour, or 3+ manual in 24 h, per language', async () => {
  const db = newsDb();
  await enqueueJobs(db, [job('u-ru', 'ru', 'urgent')], T0 - 61 * MIN);
  await enqueueJobs(db, [job('i-he', 'he', 'important'), job('n-ru', 'ru', 'normal')], T0 - 30 * MIN);
  await enqueueJobs(db, [job('n-old', 'he', 'normal')], T0 - 5 * HOUR); // normal: by quota, no alert
  for (const id of ['m1', 'm2', 'm3']) {
    await enqueueJobs(db, [job(id, 'he', 'normal')], T0 - 2 * HOUR);
    for (let i = 0; i < 3; i++) await settleJob(db, { ...job(id, 'he', 'normal'), attempts: i }, 'rejected', { reason: 'x' }, T0 - HOUR);
  }
  const out = await translationAlerts(db, T0);
  assert.deepEqual(out.active.map(a => a.type).sort(), ['manual:he', 'stalled:ru']);
  assert.deepEqual(out.active.find(a => a.type === 'stalled:ru').tiers, { urgent: 1 });
  assert.deepEqual(out.announced.sort(), ['manual:he', 'stalled:ru']);
  assert.deepEqual(state(db, 'translation_alert').active.length, 2, 'visible to /ops');
});

test('alert: each type is announced at most once an hour and clears when the queue moves', async () => {
  const db = newsDb();
  await enqueueJobs(db, [job('u', 'ru', 'urgent')], T0 - 2 * HOUR);
  assert.deepEqual((await translationAlerts(db, T0)).announced, ['stalled:ru']);
  assert.deepEqual((await translationAlerts(db, T0 + 30 * MIN)).announced, [], 'not again within the hour');
  assert.deepEqual((await translationAlerts(db, T0 + ALERT.repeatMs)).announced, ['stalled:ru']);
  await settleJob(db, job('u', 'ru', 'urgent'), 'done', {}, T0 + ALERT.repeatMs + MIN);
  const cleared = await translationAlerts(db, T0 + ALERT.repeatMs + 2 * MIN);
  assert.deepEqual(cleared.active, []);
  assert.deepEqual(state(db, 'translation_alert').active, []);
});

// ---------- (b) archive ----------
const BAD_RU = { id: 'bad', headline: 'Iran fires missiles at Jordan', headline_ru: 'Иран выпустил ракеты по Израилю' };
const GOOD_RU = { id: 'good', headline: 'Iran fires missiles at Jordan', headline_ru: 'Иран выпустил ракеты по Иордании' };

test('archive RU: an accepted title that fails today\'s gates is queued again as a normal redo job', async () => {
  const db = newsDb();
  const t = atLane('ru');
  addNews(db, { ...BAD_RU, published_ms: t - 2 * 86400000 });
  addNews(db, { ...GOOD_RU, published_ms: t - 86400000 });
  addNews(db, { id: 'old', headline: BAD_RU.headline, headline_ru: BAD_RU.headline_ru, published_ms: t - 8 * 86400000 });
  const out = await recheckArchive({ NEWS_DB: db, CORE_DB: coreDb() }, t);
  assert.deepEqual([out.lane, out.state, out.queued], ['ru', 'pass_done', 1]);
  const j = db.one("SELECT * FROM translation_jobs WHERE language='ru'");
  assert.deepEqual([j.item_id, j.tier, j.state, JSON.parse(j.payload_json).redo], ['bad', 'normal', 'pending', true]);
  const s = state(db, 'translation_archive').ru;
  assert.deepEqual([s.last_pass.checked, s.last_pass.redo, s.examples[0].reason], [2, 1, 'jordan_name_missing']);
  assert.ok(s.paused_until_ms >= t + ARCHIVE.pauseMs, 'next pass after a pause');
  assert.equal((await recheckArchive({ NEWS_DB: db, CORE_DB: coreDb() }, t + 15 * MIN)).state, 'paused');
});

test('archive RU: the redo replaces the failing title in the normal queue, without an SLA row', async () => {
  const db = newsDb();
  const t = atLane('ru');
  addNews(db, { ...BAD_RU, published_ms: t - HOUR });
  await recheckArchive({ NEWS_DB: db, CORE_DB: coreDb() }, t);
  const AI = ai((model, input) => ({
    response: JSON.stringify(JSON.parse(input.messages[1].content).map(x => ({ id: x.id, title_ru: GOOD_RU.headline_ru }))),
    usage: { neurons: 40 },
  }));
  const out = await translateTitles({ NEWS_DB: db, AI }, t + MIN);
  assert.equal(out.translated, 1);
  assert.equal(db.one("SELECT headline_ru FROM news_items WHERE id='bad'").headline_ru, GOOD_RU.headline_ru);
  assert.equal(db.one("SELECT state FROM translation_jobs WHERE item_id='bad'").state, 'done');
  assert.equal(db.one("SELECT count(*) n FROM sqlite_master WHERE name='translation_latency'").n
    ? db.one("SELECT count(*) n FROM translation_latency").n : 0, 0, 'a redo is not a first display');
  // The repaired title passes the next pass.
  db.raw.exec("DELETE FROM editor_state WHERE key='translation_archive'");
  assert.equal((await recheckArchive({ NEWS_DB: db, CORE_DB: coreDb() }, t + 2 * MIN + 15 * MIN)).queued, 0);
});

test('archive RU: a redo whose new title is rejected keeps the old row and counts an attempt', async () => {
  const db = newsDb();
  const t = atLane('ru');
  addNews(db, { ...BAD_RU, published_ms: t - HOUR });
  await recheckArchive({ NEWS_DB: db, CORE_DB: coreDb() }, t);
  const AI = ai((model, input) => ({
    response: JSON.stringify(JSON.parse(input.messages[1].content).map(x => ({ id: x.id, title_ru: BAD_RU.headline_ru }))),
    usage: { neurons: 40 },
  }));
  await translateTitles({ NEWS_DB: db, AI }, t + MIN);
  const j = db.one("SELECT state,attempts FROM translation_jobs WHERE item_id='bad'");
  assert.deepEqual([j.state, j.attempts], ['pending', 1]);
  assert.equal(db.one("SELECT headline_ru FROM news_items WHERE id='bad'").headline_ru, BAD_RU.headline_ru);
});

const heRow = (db, kind, id, text, he, at) =>
  fingerprint(text).then(sha =>
    db.raw
      .prepare("INSERT INTO regional_i18n VALUES(?,?,'he',?,?,?,?,95,'m',?)")
      .run(kind, id, sha, he.title, he.body || '', he.comment || '', at),
  );

test('archive HE: script and glossary failures in NEWS and CORE go back to the queue; clean ones do not', async () => {
  const db = newsDb(),
    core = coreDb();
  let t = atLane('he_news');
  addNews(db, { id: 'n-ar', headline: 'Iran warns Israel', published_ms: t - HOUR });
  addNews(db, { id: 'n-ok', headline: 'Iran warns Israel', published_ms: t - HOUR });
  const nText = sourceText('news', { headline: 'Iran warns Israel', summary: '' });
  await heRow(db, 'news', 'n-ar', nText, { title: 'אيران מזהירה את ישראל' }, t - HOUR);
  await heRow(db, 'news', 'n-ok', nText, { title: 'איראן מזהירה את ישראל' }, t - HOUR);
  const env = { NEWS_DB: db, CORE_DB: core };
  const a = await recheckArchive(env, t);
  assert.deepEqual([a.lane, a.queued], ['he_news', 1]);
  const j = db.one("SELECT * FROM translation_jobs WHERE language='he'");
  assert.deepEqual([j.item_id, j.tier, JSON.parse(j.payload_json).title], ['n-ar', 'normal', 'Iran warns Israel']);

  t = atLane('he_core', t);
  core.raw.prepare("INSERT INTO analyst_publications VALUES('7','Iran fires missiles at Jordan','','','published',?)").run(t - HOUR);
  const aText = sourceText('analyst', { headline: 'Iran fires missiles at Jordan', summary: '', short_quote: '' });
  await heRow(core, 'analyst', '7', aText, { title: 'איראן שיגרה טילים לעבר ישראל' }, t - HOUR);
  const b = await recheckArchive(env, t);
  assert.deepEqual([b.lane, b.queued], ['he_core', 1]);
  assert.equal(db.one("SELECT last_reason FROM translation_jobs WHERE kind='analyst'").last_reason, null);
  assert.equal(state(db, 'translation_archive').he_core.examples[0].reason, 'title:jordan_name_missing');
});

test('archive: at most a few redo jobs per tick, the cursor resumes where it stopped', async () => {
  const db = newsDb();
  let t = atLane('ru');
  for (let i = 0; i < ARCHIVE.redoPerTick + 3; i++)
    addNews(db, { ...BAD_RU, id: 'b' + i, published_ms: t - HOUR - i * MIN });
  const first = await recheckArchive({ NEWS_DB: db, CORE_DB: coreDb() }, t);
  assert.deepEqual([first.state, first.queued], ['running', ARCHIVE.redoPerTick]);
  t = atLane('ru', t + 300000);
  const second = await recheckArchive({ NEWS_DB: db, CORE_DB: coreDb() }, t);
  assert.deepEqual([second.state, second.queued], ['pass_done', 3]);
  assert.equal(db.one("SELECT count(*) n FROM translation_jobs").n, ARCHIVE.redoPerTick + 3);
});

test('watch: one failing part never stops the other', async () => {
  const db = newsDb();
  const out = await translationWatch({ NEWS_DB: db, CORE_DB: null }, atLane('he_core'));
  assert.ok(out.alerts);
  assert.equal(out.archive.state, 'no_db');
});

// ---------- meaning-check samples (acceptance of B11 part 2) ----------
test('meaning check: a rejection keeps both titles and the evidence, at most 20 a day', async () => {
  const db = newsDb();
  const AI = ai(() => null, () => ({ same_meaning: false, error: 'entity_replaced', evidence: 'Jordan became Israel' }));
  const args = {
    original: { title: 'Iran fires missiles at Jordan' },
    translation: { title: 'איראן שיגרה טילים לעבר ישראל' },
    language: 'he',
    translatorModel: 'gemini-3.5-flash-lite',
    tier: 'urgent',
  };
  for (let i = 0; i < 22; i++) assert.equal((await meaningCheck({ NEWS_DB: db, AI }, args, T0)).verdict, 'reject');
  const samples = state(db, 'meaning_check_samples:2026-11-20');
  assert.equal(samples.length, 20);
  assert.deepEqual(
    [samples[0].code, samples[0].evidence, samples[0].original, samples[0].translation, samples[0].tier],
    ['meaning:entity_replaced', 'Jordan became Israel', args.original.title, args.translation.title, 'urgent'],
  );
  assert.equal(state(db, 'meaning_check:2026-11-20').reject, 22);
});
