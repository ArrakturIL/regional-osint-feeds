// Concept E «Главное сейчас» (owner 21.11): lead + four by urgency, page-language
// titles first; source network counts by state.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/TopNow/TopNow.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm, '')
  .replace(/^export /gm, '');
const ctx = {
  UI_HE: false,
  h: () => null,
  t: () => null,
  GoLink: () => null,
  simpleTime: () => '',
  fmtTime: () => '',
};
vm.runInNewContext(
  src +
    '\nthis.topStories = topStories; this.topLead = topLead; this.sourcesOf = sourcesOf; this.networkCounts = networkCounts; this.topAge = topAge; this.leadExcerpt = leadExcerpt; this.trimExcerpt = trimExcerpt;',
  ctx,
);
const ids = list => JSON.stringify(list.map(s => s.id));

test('lead is the first urgent item; then important, then normal, keeping feed order', () => {
  const s = (id, tier, extra = {}) => ({ id, tier, title: id, translation_state: 'translated', ...extra });
  const got = ctx.topStories(
    [
      s('n1', 'normal'),
      s('i1', 'important'),
      s('u1', 'urgent'),
      s('i2', 'important'),
      s('n2', 'normal'),
      s('u2', 'urgent'),
      s('n3', 'normal'),
    ],
    'ru',
  );
  assert.equal(ids(got), '["u1","u2","i1","i2","n1"]');
});

test('an untranslated item never becomes the lead while translated ones exist', () => {
  const got = ctx.topStories(
    [
      { id: 'he-orig', tier: 'urgent', title: 'כותרת', translation_state: 'pending', content_language: 'he' },
      {
        id: 'ru',
        tier: 'important',
        title: 'Заголовок',
        translation_state: 'translated',
        content_language: 'en',
      },
    ],
    'ru',
  );
  assert.equal(ids(got), '["ru","he-orig"]');
  assert.equal(ctx.topStories(null, 'ru').length, 0);
});

test('network counts by state, unknown states ignored', () => {
  const c = ctx.networkCounts([
    { state: 'ok' },
    { state: 'ok' },
    { state: 'partial' },
    { state: 'error' },
    { state: 'weird' },
    null,
  ]);
  assert.equal(JSON.stringify(c), '{"ok":2,"partial":1,"empty":0,"error":1}');
});

test('top cards say how old the news is, in both languages', () => {
  const now = Date.parse('2026-11-21T17:00:00Z');
  const at = min => new Date(now - min * 60000).toISOString();
  assert.equal(ctx.topAge(at(0.5), now, false), 'только что');
  assert.equal(ctx.topAge(at(42), now, false), '42 мин назад');
  assert.equal(ctx.topAge(at(185), now, false), '3 ч назад');
  assert.equal(ctx.topAge(at(60 * 50), now, false), '2 дн назад');
  assert.equal(ctx.topAge(at(42), now, true), 'לפני 42 דק׳');
  assert.equal(ctx.topAge(at(-5), now, false), '');
  assert.equal(ctx.topAge('bad', now, false), '');
});

test('lead excerpt that only repeats the title is dropped', () => {
  const title = 'Бахрейн заявляет, что иранская атака попала в промышленное предприятие';
  assert.equal(ctx.leadExcerpt({ title, excerpt: title }), '');
  assert.equal(ctx.leadExcerpt({ title, excerpt: title + '.' }), '');
  assert.equal(ctx.leadExcerpt({ title, excerpt: 'Бахрейн заявляет' }), '');
  const real = 'Министерство внутренних дел сообщило о пожаре на заводе в Ситре, пострадавших нет.';
  assert.equal(ctx.leadExcerpt({ title, excerpt: real }), real);
  assert.equal(ctx.leadExcerpt({ title }), '');
});

test('lead rule 22.11: fresh urgent, confirmed first; nothing fresh → no lead', () => {
  const now = Date.parse('2026-11-22T20:00:00Z');
  const ago = h => new Date(now - h * 3600e3).toISOString();
  const s = (id, tier, h, n = 1) => ({
    id,
    tier,
    title: id,
    time: ago(h),
    reporting_origin_count: n,
    translation_state: 'translated',
  });
  const pick = list => ctx.topLead(list, 'ru', now).lead?.id || null;
  assert.equal(pick([s('i2', 'important', 1, 3), s('u1', 'urgent', 2, 1), s('u2', 'urgent', 3, 2)]), 'u2');
  assert.equal(pick([s('u1', 'urgent', 1, 1), s('u0', 'urgent', 0.5, 1)]), 'u0');
  assert.equal(pick([s('u-old', 'urgent', 7, 4), s('n', 'normal', 0.1, 5)]), null);
  assert.equal(
    JSON.stringify(
      ctx.sourcesOf({
        source: 'AJ',
        related: [{ title: 'Al Jazeera' }, { title: 'Times of Israel' }, { title: 'Al Jazeera' }],
      }),
    ),
    '["Al Jazeera","Times of Israel"]',
  );
  assert.equal(JSON.stringify(ctx.sourcesOf({ source: 'BBC' })), '["BBC"]');
});

test('lead excerpt ends on a whole sentence or a whole word, never mid-word (owner 23.11)', () => {
  const long =
    'Американские источники полагают, что Трамп не отдаст приказ об ударе по Ирану в ближайшую неделю, несмотря на израильское давление. Решение будет принято после консультаций с союзниками в регионе и в Европе, сообщают собеседники.';
  const a = ctx.trimExcerpt(long, 150);
  assert.ok(a.endsWith('давление.'), a);
  const noStop =
    'Американские источники полагают что Трамп не отдаст приказ об ударе по Ирану в ближайшую неделю несмотря на израильское давление и позицию союзников';
  const b = ctx.trimExcerpt(noStop, 100);
  assert.match(b, /\S…$/);
  assert.ok(noStop.startsWith(b.slice(0, -1)), 'whole words only: ' + b);
  assert.equal(ctx.trimExcerpt('Источники говорят о давлении израильско…'), 'Источники говорят о давлении…');
  assert.equal(ctx.trimExcerpt('Короткое описание.'), 'Короткое описание.');
});
