// B10 (19.11): one translation job queue for RU and HE. Runs the real queue
// SQL on SQLite (node:sqlite) behind the D1 API, through the real schedulers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newsDb, coreDb, addNews, addGroup, ai } from './editor-d1-fixture.mjs';
import {
  enqueueJobs,
  dueJobs,
  settleJob,
  normalAllowed,
  MAX_ATTEMPTS,
  MAX_AGE_MS,
  RESERVE,
} from '../../backend/editor/src/translations/jobs.mjs';
import { translateTitles } from '../../backend/editor/src/translations/scheduled.mjs';
import { translateScheduled } from '../../backend/editor/src/localization/scheduled.mjs';
import { isTransientFailure } from '../../backend/editor/src/localization/retry-policy.mjs';
import { sourceText, fingerprint, legacyNewsPivotText } from '../../backend/editor/src/localization/shared.mjs';
import { newsTier } from '../../backend/editor/src/news/tier.mjs';
import { AI_POOL_NEURONS } from '../../backend/editor/src/ai/budget.mjs';

const MIN = 60000,
  HOUR = 3600000;
const NOW = Date.parse('2026-11-19T10:00:00Z');
const DAY = new Date(NOW).toISOString().slice(0, 10);
const URGENT = 'Sirens sound in northern Israel after rocket launch from Lebanon';
const IMPORTANT = 'Israel and regional leaders discuss security negotiations';
const NORMAL = 'Tel Aviv museum opens new art exhibition';
const RU = {
  [URGENT]: 'Сирены звучат на севере Израиля после запуска ракеты из Ливана',
  [IMPORTANT]: 'Израиль и региональные лидеры обсуждают переговоры о безопасности',
  [NORMAL]: 'Музей Тель-Авива открывает новую художественную выставку',
};
test('fixtures are in the tiers the tests rely on', () => {
  assert.deepEqual(
    [URGENT, IMPORTANT, NORMAL].map(h => newsTier({ headline: h, summary: '' }).tier),
    ['urgent', 'important', 'normal'],
  );
});

const job = (id, tier, extra = {}) => ({
  kind: 'news',
  id,
  language: 'ru',
  sourceHash: 'h-' + id,
  tier,
  discoveredMs: NOW,
  ...extra,
});

// ---------- queue ----------
test('queue serves urgent > important > normal, newest first, and normal can be held back', async () => {
  const db = newsDb();
  await enqueueJobs(
    db,
    [
      job('n1', 'normal', { discoveredMs: NOW }),
      job('i1', 'important', { discoveredMs: NOW - HOUR }),
      job('u-old', 'urgent', { discoveredMs: NOW - 2 * HOUR }),
      job('u-new', 'urgent', { discoveredMs: NOW - MIN }),
    ],
    NOW,
  );
  assert.deepEqual(
    (await dueJobs(db, 'ru', NOW, 10)).map(j => j.id),
    ['u-new', 'u-old', 'i1', 'n1'],
  );
  assert.deepEqual(
    (await dueJobs(db, 'ru', NOW, 10, { allowNormal: false })).map(j => j.id),
    ['u-new', 'u-old', 'i1'],
  );
  assert.deepEqual(await dueJobs(db, 'he', NOW, 10), [], 'languages are separate queues');
});

test('re-enqueueing an unchanged job writes nothing; a new source text restarts it', async () => {
  const db = newsDb();
  assert.equal(await enqueueJobs(db, [job('a', 'normal')], NOW), 1);
  const [j] = await dueJobs(db, 'ru', NOW, 1);
  await settleJob(db, j, 'rejected', { reason: 'quality_gate' }, NOW);
  assert.equal(await enqueueJobs(db, [job('a', 'normal')], NOW + MIN), 0, 'no D1 write when nothing changed');
  assert.equal(db.one("SELECT attempts FROM translation_jobs WHERE item_id='a'").attempts, 1);
  await enqueueJobs(db, [job('a', 'normal', { sourceHash: 'edited' })], NOW + 2 * MIN);
  const row = db.one("SELECT attempts,state,next_at_ms FROM translation_jobs WHERE item_id='a'");
  assert.deepEqual(row, { attempts: 0, state: 'pending', next_at_ms: NOW + 2 * MIN });
});

test('a rejected job backs off per tier, goes manual after three; a transient failure only defers', async () => {
  const db = newsDb();
  await enqueueJobs(db, [job('u', 'urgent'), job('n', 'normal')], NOW);
  let [u] = await dueJobs(db, 'ru', NOW, 1);
  await settleJob(db, u, 'deferred', { reason: 'no_route_available' }, NOW);
  assert.equal(db.one("SELECT attempts FROM translation_jobs WHERE item_id='u'").attempts, 0);
  assert.equal(db.one("SELECT next_at_ms FROM translation_jobs WHERE item_id='u'").next_at_ms, NOW + 5 * MIN);
  let t = NOW + 5 * MIN;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    [u] = (await dueJobs(db, 'ru', t, 5)).filter(j => j.id === 'u');
    assert.ok(u, 'urgent job due again at attempt ' + i);
    await settleJob(db, u, 'rejected', { reason: 'quality_gate', model: 'm' }, t);
    const row = db.one("SELECT attempts,state,next_at_ms FROM translation_jobs WHERE item_id='u'");
    assert.equal(row.attempts, i);
    if (i < MAX_ATTEMPTS) {
      assert.equal(row.state, 'pending');
      assert.equal(row.next_at_ms, t + (i === 1 ? 5 : 15) * MIN, 'urgent back-off 5, then 15 min');
      t = row.next_at_ms;
    } else assert.equal(row.state, 'manual', 'third rejection goes to the manual queue');
  }
  const [n] = await dueJobs(db, 'ru', NOW, 5);
  await settleJob(db, n, 'rejected', { reason: 'x' }, NOW);
  assert.equal(db.one("SELECT next_at_ms FROM translation_jobs WHERE item_id='n'").next_at_ms, NOW + 30 * MIN);
});

test('nothing drops out silently: a job older than 72 h moves to the manual queue', async () => {
  const db = newsDb();
  await enqueueJobs(db, [job('old', 'normal')], NOW - MAX_AGE_MS - MIN);
  assert.deepEqual(await dueJobs(db, 'ru', NOW, 5), []);
  assert.deepEqual(db.one("SELECT state,last_reason FROM translation_jobs WHERE item_id='old'"), {
    state: 'manual',
    last_reason: 'expired_72h',
  });
});

test('normal jobs keep a reserve of the Workers AI pool and of Gemini calls for urgent/important', async () => {
  const db = newsDb();
  assert.equal(await normalAllowed(db, NOW), true);
  db.raw.prepare('INSERT INTO ai_daily_neurons VALUES(?,?,1,0)').run(DAY, AI_POOL_NEURONS - RESERVE.neurons);
  assert.equal(await normalAllowed(db, NOW), false);
  db.raw.exec('DELETE FROM ai_daily_neurons');
  db.raw
    .prepare("INSERT INTO ai_provider_calls VALUES(?,'gemini:flash-lite',?,0)")
    .run(DAY, RESERVE.geminiCap - RESERVE.geminiCalls);
  assert.equal(await normalAllowed(db, NOW), false);
});

test('transient failures are told apart from translation verdicts', () => {
  for (const e of [
    'ai_global_budget_exhausted',
    'no_route_available',
    'model_incomplete',
    'model_invalid_response',
    "Unexpected token 'x', \"x\" is not valid JSON",
    'gemini_429',
    '8004: Internal server error',
  ])
    assert.equal(isTransientFailure(e), true, e);
  for (const e of ['low_translation_confidence', 'numbers_changed_title', 'body:mixed_script_word', 'title:hamas_name_missing'])
    assert.equal(isTransientFailure(e), false, e);
});

// ---------- RU titles ----------
const ruAnswer = (pick = h => RU[h]) =>
  ai((model, input) => {
    const items = JSON.parse(input.messages[1].content);
    return {
      response: JSON.stringify(items.map(x => ({ id: x.id, title_ru: pick(x.headline) }))),
      usage: { neurons: 60 },
    };
  });
const ruEnv = (db, AI) => ({ NEWS_DB: db, AI });
const ruJob = (db, id) => db.one("SELECT * FROM translation_jobs WHERE language='ru' AND item_id=?", id);

test('RU: displayed items only — fresh high priority and current event representatives', async () => {
  const db = newsDb();
  addNews(db, { id: 'high', headline: IMPORTANT, priority: 8, published_ms: NOW - HOUR });
  addNews(db, { id: 'high-old', headline: IMPORTANT, priority: 9, published_ms: NOW - 48 * HOUR });
  addNews(db, { id: 'rep4', headline: IMPORTANT, priority: 4, published_ms: NOW - 60 * HOUR });
  addGroup(db, { rep: 'rep4', priority: 4, last_seen_ms: NOW - 30 * MIN });
  addNews(db, { id: 'stale-rep', headline: IMPORTANT, priority: 4, published_ms: NOW - HOUR });
  addGroup(db, { rep: 'stale-rep', priority: 4, last_seen_ms: NOW - 40 * HOUR });
  addNews(db, { id: 'held3', headline: IMPORTANT, priority: 3, published_ms: NOW - HOUR });
  addGroup(db, { rep: 'held3', priority: 3, last_seen_ms: NOW - HOUR });
  addNews(db, { id: 'spam', headline: 'Sponsored content for fashion week', priority: 9, published_ms: NOW - HOUR });
  const AI = ruAnswer();
  const out = await translateTitles(ruEnv(db, AI), NOW);
  assert.equal(out.translated, 2);
  assert.deepEqual(
    db.rows("SELECT id FROM news_items WHERE headline_ru IS NOT NULL ORDER BY id").map(r => r.id),
    ['high', 'rep4'],
  );
  assert.deepEqual(
    db.rows("SELECT item_id FROM translation_jobs ORDER BY item_id").map(r => r.item_id),
    ['high', 'rep4'],
    'no job for hidden, stale or spam items',
  );
  assert.equal(AI.calls.length, 1, 'one batch');
});

test('RU: urgent before newer normal; at most 5 per batch; neurons settle to real spend', async () => {
  const db = newsDb();
  for (let i = 0; i < 6; i++) addNews(db, { id: 'n' + i, headline: NORMAL, published_ms: NOW - i * MIN });
  addNews(db, { id: 'u', headline: URGENT, published_ms: NOW - 3 * HOUR });
  const AI = ruAnswer();
  const out = await translateTitles(ruEnv(db, AI), NOW);
  assert.equal(out.translated, 5);
  const sent = JSON.parse(AI.calls[0].input.messages[1].content).map(x => x.id);
  assert.equal(sent[0], 'u', 'urgent goes first although older');
  assert.equal(sent.length, 5);
  assert.deepEqual(db.one('SELECT batches,estimated_neurons FROM news_translation_budget'), {
    batches: 1,
    estimated_neurons: 60,
  });
  assert.equal(ruJob(db, 'u').state, 'done');
  assert.equal(ruJob(db, 'n5').state, 'pending', 'the sixth waits for the next tick');
});

test('RU: summary-only job keeps the existing Russian headline', async () => {
  const db = newsDb();
  addNews(db, {
    id: 's',
    headline: IMPORTANT,
    headline_ru: 'Существующий заголовок',
    summary: 'Regional officials discussed cooperation and future negotiations.',
    published_ms: NOW - HOUR,
  });
  const AI = ai(() => ({
    response: JSON.stringify([
      { id: 's', title_ru: RU[IMPORTANT], summary_ru: 'Региональные представители обсудили сотрудничество и дальнейшие переговоры.' },
    ]),
    usage: { neurons: 30 },
  }));
  const out = await translateTitles(ruEnv(db, AI), NOW);
  assert.deepEqual([out.translated, out.summaries], [0, 1]);
  assert.equal(db.one("SELECT headline_ru FROM news_items WHERE id='s'").headline_ru, 'Существующий заголовок');
});

test('RU: a rejected item is retried after the back-off (not tomorrow), manual after three', async () => {
  const db = newsDb();
  addNews(db, { id: 'u', headline: URGENT, published_ms: NOW - HOUR });
  const bad = ruAnswer(h => h); // English back: rejected by the quality gate
  await translateTitles(ruEnv(db, bad), NOW);
  assert.deepEqual([ruJob(db, 'u').state, ruJob(db, 'u').attempts, ruJob(db, 'u').last_reason], ['pending', 1, 'quality_gate']);
  await translateTitles(ruEnv(db, bad), NOW + MIN);
  assert.equal(bad.calls.length, 1, 'not re-sent inside the back-off');
  await translateTitles(ruEnv(db, bad), NOW + 5 * MIN);
  await translateTitles(ruEnv(db, bad), NOW + 20 * MIN);
  assert.equal(bad.calls.length, 3);
  assert.equal(ruJob(db, 'u').state, 'manual');
  await translateTitles(ruEnv(db, ruAnswer()), NOW + 60 * MIN);
  assert.equal(db.one("SELECT headline_ru FROM news_items WHERE id='u'").headline_ru, null, 'manual jobs are not auto-retried');
});

test('RU: nobody answered (pool spent, provider down) — deferred, no attempt counted, error journaled', async () => {
  const db = newsDb();
  addNews(db, { id: 'i', headline: IMPORTANT, published_ms: NOW - HOUR });
  const down = ai(() => {
    throw new Error('ai_global_budget_exhausted');
  });
  const out = await translateTitles(ruEnv(db, down), NOW);
  assert.equal(out.error, true);
  assert.deepEqual([ruJob(db, 'i').attempts, ruJob(db, 'i').next_at_ms], [0, NOW + 5 * MIN]);
  assert.match(db.one("SELECT value FROM editor_state WHERE key='last_translation_error'").value, /budget_exhausted/);
  const malformed = ai(() => ({ response: 'not json at all', usage: { neurons: 10 } }));
  await translateTitles(ruEnv(db, malformed), NOW + 5 * MIN);
  assert.equal(ruJob(db, 'i').attempts, 0, 'a broken answer is not a verdict on the item');
});

test('RU: a queued job is finished after its item leaves the 36 h selection window', async () => {
  const db = newsDb();
  addNews(db, { id: 'i', headline: IMPORTANT, published_ms: NOW - 35 * HOUR });
  await translateTitles(ruEnv(db, ruAnswer(h => h)), NOW); // rejected, job stays
  const later = NOW + 2 * HOUR; // the item is now 37 h old
  await translateTitles(ruEnv(db, ruAnswer()), later);
  assert.equal(db.one("SELECT headline_ru FROM news_items WHERE id='i'").headline_ru, RU[IMPORTANT]);
  assert.equal(ruJob(db, 'i').state, 'done');
});

test('RU: with the pool down to its reserve only urgent/important are served', async () => {
  const db = newsDb();
  addNews(db, { id: 'n', headline: NORMAL, published_ms: NOW - MIN });
  addNews(db, { id: 'u', headline: URGENT, published_ms: NOW - HOUR });
  db.raw.prepare('INSERT INTO ai_daily_neurons VALUES(?,?,1,0)').run(DAY, AI_POOL_NEURONS - 100);
  const AI = ruAnswer();
  await translateTitles(ruEnv(db, AI), NOW);
  assert.deepEqual(JSON.parse(AI.calls[0].input.messages[1].content).map(x => x.id), ['u']);
  assert.equal(ruJob(db, 'n').state, 'pending');
});

test('RU: daily batch ceiling stops before any source read or AI call', async () => {
  const db = newsDb();
  addNews(db, { id: 'u', headline: URGENT, published_ms: NOW - HOUR });
  db.raw.prepare('INSERT INTO news_translation_budget VALUES(?,288,0,0)').run(DAY);
  const AI = ruAnswer();
  assert.deepEqual(await translateTitles(ruEnv(db, AI), NOW), { translated: 0, summaries: 0, budget: 'limit' });
  assert.equal(AI.calls.length, 0);
});

test('RU: concurrent ticks share the last (288th) batch slot atomically', async () => {
  const db = newsDb();
  for (let i = 0; i < 10; i++) addNews(db, { id: 'i' + i, headline: IMPORTANT, published_ms: NOW - i * MIN });
  db.raw.prepare('INSERT INTO news_translation_budget VALUES(?,287,0,0)').run(DAY);
  const AI = ruAnswer();
  const out = await Promise.all([translateTitles(ruEnv(db, AI), NOW), translateTitles(ruEnv(db, AI), NOW)]);
  assert.equal(db.one('SELECT batches FROM news_translation_budget').batches, 288);
  assert.equal(AI.calls.length, 1);
  assert.equal(out.filter(x => x.budget === 'limit').length, 1);
});

test('RU: Gemini first, llama only for what Gemini got wrong, in the same tick', async () => {
  const db = newsDb();
  addNews(db, { id: 'g', headline: URGENT, published_ms: NOW - HOUR });
  addNews(db, { id: 'l', headline: IMPORTANT, published_ms: NOW - HOUR });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url =>
    String(url).includes(':generateContent')
      ? Response.json({
          candidates: [
            {
              content: { parts: [{ text: JSON.stringify([{ id: 'g', title_ru: RU[URGENT] }, { id: 'l', title_ru: IMPORTANT }]) }] },
              finishReason: 'STOP',
            },
          ],
        })
      : Response.json({ models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] });
  const llama = ruAnswer();
  try {
    const out = await translateTitles({ NEWS_DB: db, AI: llama, GEMINI_API_KEY: 'K' }, NOW);
    assert.equal(out.translated, 2);
    assert.equal(out.neurons, 60, 'only llama spends Workers AI neurons');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(llama.calls.map(c => JSON.parse(c.input.messages[1].content).map(x => x.id)), [['l']]);
  assert.equal(ruJob(db, 'g').last_model.startsWith('gemini'), true);
});

// ---------- HE ----------
const BASE = Date.parse('2026-11-19T02:00:00Z');
const cycle = ['news', 'analyst', 'story', 'editorial', 'news', 'profile'];
const atKind = (name, from = BASE) => {
  for (let i = 0; i < 12; i++) {
    const n = from + i * 300000;
    if (cycle[Math.floor(n / 300000) % cycle.length] === name) return n;
  }
  throw Error(name);
};
const heTitle = 'ישראל מדווחת על 7 כטב״מים ליד הגבול';
const heAnswer = (value = { title: heTitle, body: '', comment: '', confidence: 96 }) =>
  ai(() => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], usage: { neurons: 12 } }));
const heEnv = (db, AI, core = coreDb()) => ({ NEWS_DB: db, CORE_DB: core, AI });
const heJob = (db, id) => db.one("SELECT * FROM translation_jobs WHERE language='he' AND item_id=?", id);
const drones = 'Israel reports 7 drones near the border';

test('HE: displayed news only; at most 4 paid attempts per tick, urgent first', async () => {
  const db = newsDb();
  const t = atKind('news');
  addNews(db, { id: 'u', headline: URGENT, published_ms: t - 2 * HOUR });
  for (let i = 0; i < 5; i++) addNews(db, { id: 'd' + i, headline: drones, published_ms: t - i * MIN });
  addNews(db, { id: 'low', headline: drones, priority: 3, published_ms: t - MIN });
  const AI = heAnswer({ title: 'סירנות נשמעות בצפון ישראל לאחר שיגור רקטה מלבנון', body: '', comment: '', confidence: 95 });
  const AI2 = heAnswer();
  const env = heEnv(db, { run: (m, i) => (JSON.stringify(i).includes('Sirens') ? AI.run(m, i) : AI2.run(m, i)) });
  const out = await translateScheduled(env, t);
  assert.equal(out.attempted, 4);
  assert.equal(heJob(db, 'u').state, 'done', 'urgent item translated in the first tick');
  assert.equal(heJob(db, 'low'), null, 'priority 3, not displayed: no job');
  assert.equal(db.one("SELECT count(*) n FROM translation_jobs WHERE language='he' AND state='pending'").n, 2);
});

test('HE: native Hebrew needs no job; a Hebrew headline with an English summary does', async () => {
  const db = newsDb();
  const t = atKind('news');
  addNews(db, { id: 'native', headline: 'צה״ל מדווח על יירוט', summary: 'כל הפרטים בהמשך', published_ms: t - MIN });
  addNews(db, { id: 'mixed', headline: 'צה״ל מדווח על יירוט', summary: 'Details follow in the statement', published_ms: t - MIN });
  const AI = heAnswer({ title: 'צה״ל מדווח על יירוט', body: 'הפרטים בהמשך ההודעה', comment: '', confidence: 95 });
  const out = await translateScheduled(heEnv(db, AI), t);
  assert.equal(heJob(db, 'native'), null);
  assert.equal(out.attempted, 1);
  assert.equal(heJob(db, 'mixed').state, 'done');
});

test('HE: a changed number is a rejection (attempt logged, retried later, manual after three)', async () => {
  const db = newsDb();
  let t = atKind('news');
  addNews(db, { id: 'n', headline: drones, published_ms: t - MIN });
  const wrong = heAnswer({ title: 'ישראל מדווחת על 8 כטב״מים ליד הגבול', body: '', comment: '', confidence: 99 });
  await translateScheduled(heEnv(db, wrong), t);
  assert.deepEqual([heJob(db, 'n').attempts, heJob(db, 'n').last_reason], [1, 'numbers_changed_title']);
  assert.equal(db.one("SELECT state,error FROM regional_i18n_attempts WHERE item_id='n'").error, 'numbers_changed_title');
  assert.equal(db.one("SELECT count(*) n FROM regional_i18n WHERE item_id='n'").n, 0);
  for (const step of [15, 30]) {
    t = heJob(db, 'n').next_at_ms; // important: back-off 15, then 30 min
    await translateScheduled(heEnv(db, wrong), t);
    void step;
  }
  assert.equal(heJob(db, 'n').state, 'manual');
  assert.equal(wrong.calls.length, 3);
});

test('HE: a transient model failure only defers the job', async () => {
  const db = newsDb();
  const t = atKind('news');
  addNews(db, { id: 'n', headline: drones, published_ms: t - MIN });
  const cut = ai(() => ({ choices: [{ finish_reason: 'length', message: { content: '{' } }], usage: { neurons: 12 } }));
  await translateScheduled(heEnv(db, cut), t);
  assert.deepEqual([heJob(db, 'n').attempts, heJob(db, 'n').state, heJob(db, 'n').next_at_ms], [0, 'pending', t + 5 * 60000]);
  assert.equal(db.one('SELECT estimated_neurons FROM regional_i18n_budget').estimated_neurons, 12, 'spent neurons are still charged');
});

test('HE: daily ceilings (300 attempts or 6000 neurons) stop before any source read or AI call', async () => {
  for (const [attempts, neurons] of [
    [300, 0],
    [0, 6000],
  ]) {
    const db = newsDb();
    const t = atKind('news');
    addNews(db, { id: 'n', headline: drones, published_ms: t - MIN });
    db.raw.prepare('INSERT INTO regional_i18n_budget VALUES(?,?,?,0)').run(new Date(t).toISOString().slice(0, 10), attempts, neurons);
    const AI = heAnswer();
    assert.deepEqual(await translateScheduled(heEnv(db, AI), t), { state: 'budget' });
    assert.equal(AI.calls.length, 0);
    assert.equal(db.one("SELECT count(*) n FROM sqlite_master WHERE name='translation_jobs'").n, 0);
  }
});

test('HE: an accepted translation that fails today’s checks is re-done; a trusted one is left alone', async () => {
  const db = newsDb();
  const t = atKind('news');
  addNews(db, { id: 'bad', headline: drones, published_ms: t - MIN });
  addNews(db, { id: 'good', headline: drones, published_ms: t - MIN });
  const text = sourceText('news', { headline: drones, summary: '', comment: null });
  const sha = await fingerprint(text);
  const put = db.raw.prepare("INSERT INTO regional_i18n VALUES('news',?,'he',?,?,'','',95,'m',0)");
  put.run('bad', sha, heTitle + 'ة'); // Arabic letter inside a Hebrew word (Q1)
  put.run('good', sha, heTitle);
  const AI = heAnswer();
  await translateScheduled(heEnv(db, AI), t);
  assert.equal(heJob(db, 'good'), null);
  assert.equal(heJob(db, 'bad').state, 'done');
  assert.equal(db.one("SELECT title FROM regional_i18n WHERE item_id='bad'").title, heTitle);
  assert.equal(AI.calls.length, 1);
});

test('HE: legacy pivot translations (made from Russian) stay in the manual backlog', async () => {
  const db = newsDb();
  const t = atKind('news');
  const row = {
    headline: 'Israel reports 5 drones',
    headline_ru: 'Израиль сообщает о 5 беспилотниках',
    summary: 'A statement from the border',
    summary_ru: 'Заявление с границы',
  };
  addNews(db, { id: 'legacy', ...row, published_ms: t - MIN });
  const legacy = await fingerprint(legacyNewsPivotText({ ...row, comment: null }));
  db.raw.prepare("INSERT INTO regional_i18n VALUES('news','legacy','he',?,'ישראל מדווחת על 5 כטב״מים','','',95,'m',0)").run(legacy);
  const AI = heAnswer();
  await translateScheduled(heEnv(db, AI), t);
  assert.equal(heJob(db, 'legacy'), null);
  assert.equal(AI.calls.length, 0);
});

test('HE: analyst publications (CORE_DB) are queued on their turn and written to CORE', async () => {
  const db = newsDb(),
    core = coreDb();
  const t = atKind('analyst');
  core.raw
    .prepare("INSERT INTO analyst_publications VALUES('a1',?,?,'', 'published',?)")
    .run('Analyst: Israel reports 7 drones near the border', 'Assessment of the border situation', t - HOUR);
  const AI = heAnswer({ title: 'אנליסט: ישראל מדווחת על 7 כטב״מים ליד הגבול', body: 'הערכה של המצב בגבול', comment: '', confidence: 95 });
  const out = await translateScheduled(heEnv(db, AI, core), t);
  assert.equal(out.translated, 1);
  assert.equal(core.one("SELECT count(*) n FROM regional_i18n WHERE kind='analyst'").n, 1);
  assert.equal(db.one("SELECT state FROM translation_jobs WHERE kind='analyst'").state, 'done');
});

test('HE: Gemini answer with Arabic letters is rejected and glm translates it in the same tick', async () => {
  const db = newsDb();
  const t = atKind('news');
  addNews(db, { id: 'n', headline: drones, published_ms: t - MIN });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url =>
    String(url).includes(':generateContent')
      ? Response.json({
          candidates: [
            { content: { parts: [{ text: JSON.stringify({ title: heTitle + 'ة', body: '', comment: '', confidence: 97 }) }] }, finishReason: 'STOP' },
          ],
        })
      : Response.json({ models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] });
  const glm = heAnswer();
  try {
    const out = await translateScheduled({ ...heEnv(db, glm), GEMINI_API_KEY: 'K' }, t);
    assert.equal(out.translated, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(glm.calls.length, 1);
  assert.deepEqual(db.one("SELECT title,model FROM regional_i18n WHERE item_id='n'"), {
    title: heTitle,
    model: '@cf/zai-org/glm-4.7-flash',
  });
});

test('HE: a source read failure is journaled and never reported as success', async () => {
  const db = newsDb();
  db.raw.exec('DROP TABLE news_items');
  const out = await translateScheduled(heEnv(db, heAnswer()), atKind('news'));
  assert.equal(out.state, 'error');
  assert.match(db.one("SELECT value FROM editor_state WHERE key='last_he_localization_error'").value, /news_items/);
});
