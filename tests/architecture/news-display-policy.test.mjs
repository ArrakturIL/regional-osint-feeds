// B4: what a page may show while a translation is missing (owner, 18.11):
//   RU page: HE and EN originals are allowed;
//   HE page: EN originals are allowed, RU text is never shown;
//   AR originals are never shown untranslated, on any page.
// Live 18.11: the HE feed showed 6 EN articles through their Russian pivot
// translation (headline_ru), i.e. Russian text on the Hebrew page.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readNewsEvents} from '../../backend/editor/src/news/api.mjs';
import localization from '../../backend/editor/src/localization/localization.mjs';
import {scriptLanguage, allowedOnPage} from '../../backend/editor/src/localization/display-policy.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const now = Date.now();
const row = (id, headline, more = {}) => ({
  event_id: id, id, topic: 'military', event_priority: 8, priority: 8, last_seen_ms: now - 60000, published_ms: now - 60000,
  member_count: 1, source_count: 1, origin_count: 1, verification_status: 'single_origin_reporting',
  sources_json: '[]', reason_codes: '[]', source: 'Example', url: 'https://example.org/' + id,
  headline, summary: '', headline_ru: null, summary_ru: null, comment: null,
  he_hash: null, he_title: null, he_body: null, he_comment: null, he_quality: null, ...more,
});
const ROWS = [
  row('en-pivot', 'Australia sanctions Israeli settlers', {summary: 'Canberra imposed sanctions on Tuesday.',
    headline_ru: 'Австралия ввела санкции против израильских поселенцев', summary_ru: 'Канберра ввела санкции во вторник.'}),
  row('ru-native', 'Минобороны России сообщило об учениях', {summary: 'Учения прошли в Сирии.'}),
  row('ar-untranslated', 'الجيش الإسرائيلي يعلن عن غارة', {summary: 'أعلن الجيش عن غارة جديدة.'}),
  row('ar-translated', 'الجيش الإسرائيلي يعلن عن غارة جديدة', {headline_ru: 'Армия Израиля объявила о новом ударе'}),
  row('he-native', 'צה״ל תקף בדרום לבנון', {summary: 'התקיפה בוצעה הלילה.', comment: 'Редакция: удар подтверждён двумя источниками.'}),
];
const db = rows => ({prepare(sql) {
  const ok = {bind() { return this; }, all: async () => ({results: rows}), first: async () => null};
  if (sql.includes('news_event_groups') || sql.includes('FROM news_items') || sql.includes('regional_i18n')) return ok;
  throw Error('unexpected SQL ' + sql.slice(0, 80));
}});
const read = async (lang, path = '/api/news') => {
  const r = await readNewsEvents(new Request('https://rw.example' + path + '?lang=' + lang + '&limit=10&sort=latest'), {NEWS_DB: db(ROWS)});
  assert.equal(r.status, 200);
  return r.json();
};
const ids = body => body.articles.map(x => x.event_id || x.id).sort();
const shown = x => [x.headline, x.summary, x.comment].join(' ');
const CYRILLIC = /\p{Script=Cyrillic}/u, ARABIC = /\p{Script=Arabic}/u;

test('script language detection is by dominant script', () => {
  assert.equal(scriptLanguage('Australia sanctions settlers'), 'en');
  assert.equal(scriptLanguage('Удар ЦАХАЛ по Газе'), 'ru');
  assert.equal(scriptLanguage('צה״ל תקף בעזה: IDF'), 'he');
  assert.equal(scriptLanguage('الجيش الإسرائيلي'), 'ar');
  assert.equal(scriptLanguage('ЦАХАЛ: צה״ל תקף בדרום לבנון הלילה'), 'he');
  assert.equal(scriptLanguage('  2026 '), null);
});

test('page rules match the owner decision', () => {
  for (const [page, lang, ok] of [['ru', 'he', true], ['ru', 'en', true], ['ru', 'ar', false],
    ['he', 'en', true], ['he', 'ru', false], ['he', 'ar', false], ['he', 'he', true], ['ru', 'ru', true]])
    assert.equal(allowedOnPage(page, lang), ok, page + '/' + lang);
});

test('HE feed: EN original instead of the Russian pivot, no RU or AR text at all', async () => {
  const body = await read('he');
  assert.deepEqual(ids(body), ['en-pivot', 'he-native']);
  for (const x of body.articles) {
    assert.ok(!CYRILLIC.test(shown(x)), 'Cyrillic on HE page: ' + shown(x));
    assert.ok(!ARABIC.test(shown(x)), 'Arabic on HE page: ' + shown(x));
    assert.equal(x.language_shown, x.content_language);
  }
  const en = body.articles.find(x => x.event_id === 'en-pivot');
  assert.equal(en.headline, 'Australia sanctions Israeli settlers');
  assert.equal(en.content_language, 'en');
  assert.equal(en.translation_state, 'pending');
  assert.equal(body.withheld_count, 3);
});

test('RU feed: HE original allowed, AR shown only translated', async () => {
  const body = await read('ru');
  assert.deepEqual(ids(body), ['ar-translated', 'en-pivot', 'he-native', 'ru-native']);
  const ar = body.articles.find(x => x.event_id === 'ar-translated');
  assert.equal(ar.headline, 'Армия Израиля объявила о новом ударе');
  assert.equal(ar.source_language, 'ar');
  const he = body.articles.find(x => x.event_id === 'he-native');
  assert.equal(he.content_language, 'he');
  for (const x of body.articles) assert.ok(!ARABIC.test(shown(x)), 'Arabic on RU page');
  assert.equal(body.withheld_count, 1);
});

test('feed ranks keep their position when an item is withheld', async () => {
  const body = await read('he');
  const all = await read('ru');
  const rank = (b, id) => b.articles.find(x => x.event_id === id).feed_rank;
  assert.equal(rank(body, 'he-native'), rank(all, 'he-native'));
});

test('fallback /api/news reader applies the same rules', async () => {
  const env = {NEWS_DB: db(ROWS), CORE_DB: db([])};
  for (const lang of ['he', 'ru']) {
    const r = await localization.fetch(new Request('https://rw.example/api/news?lang=' + lang + '&limit=10'), env, null);
    const body = await r.json();
    assert.equal(r.status, 200);
    const expected = lang === 'he' ? ['en-pivot', 'he-native'] : ['ar-translated', 'en-pivot', 'he-native', 'ru-native'];
    assert.deepEqual(ids(body), expected, lang);
    for (const x of body.articles) {
      assert.ok(!ARABIC.test(shown(x)), lang);
      if (lang === 'he') assert.ok(!CYRILLIC.test(shown(x)), 'Cyrillic on HE fallback: ' + shown(x));
    }
  }
});
