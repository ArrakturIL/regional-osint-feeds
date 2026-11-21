// F-05: dossier counters, event dates and original-language notes, RU and HE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventDateLabel, originalLanguageNote, relatedCount, sourceCount } from '../src/utils/dossierMeta.js';

test('RU source counter is inflected (live 18.11 showed "1 Первоисточники")', () => {
  assert.equal(sourceCount(0, false), 'нет первоисточников');
  assert.equal(sourceCount(1, false), '1 первоисточник');
  assert.equal(sourceCount(3, false), '3 первоисточника');
  assert.equal(sourceCount(5, false), '5 первоисточников');
  assert.equal(sourceCount(11, false), '11 первоисточников');
  assert.equal(sourceCount(21, false), '21 первоисточник');
});
test('HE source counter is grammatical', () => {
  assert.equal(sourceCount(0, true), 'אין מקורות');
  assert.equal(sourceCount(1, true), 'מקור אחד');
  assert.equal(sourceCount(4, true), '4 מקורות');
});
test('related publications: hidden at zero, inflected otherwise', () => {
  assert.equal(relatedCount(0, false), '');
  assert.equal(relatedCount(undefined, true), '');
  assert.equal(relatedCount(1, false), '1 связанная публикация');
  assert.equal(relatedCount(2, false), '2 связанные публикации');
  assert.equal(relatedCount(7, false), '7 связанных публикаций');
  assert.equal(relatedCount(2, true), '2 פרסומים קשורים');
});
test('event date: single day and the live "2026-11-17/18" range are localized', () => {
  assert.equal(eventDateLabel('2026-11-17', false), '17 нояб.');
  assert.equal(eventDateLabel('2026-11-17/18', false), '17–18 нояб.');
  assert.match(eventDateLabel('2026-11-17/18', true), /^17–18 /);
  assert.doesNotMatch(eventDateLabel('2026-11-17/18', true), /[А-Яа-яЁё]/);
  assert.equal(eventDateLabel('ночь на 18 ноября', false), 'ночь на 18 ноября', 'free text passes through');
  assert.equal(eventDateLabel('', false), '');
});
test('original-language note names the real language, never a wrong one', () => {
  assert.equal(originalLanguageNote('en', false), 'Оригинал на английском · перевод ожидается');
  assert.equal(originalLanguageNote('ar', false), 'Оригинал на арабском · перевод ожидается');
  assert.equal(originalLanguageNote('xx', false), 'Оригинал на другом языке · перевод ожидается');
  assert.equal(originalLanguageNote('ru', true), 'המקור ברוסית · התרגום ממתין');
  assert.equal(originalLanguageNote('ar', true), 'המקור בערבית · התרגום ממתין');
});

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as meta from '../src/utils/dossierMeta.js';
const dossierSrc = readFileSync(
  new URL('../src/components/StoryDossier/StoryDossier.js', import.meta.url),
  'utf8',
)
  .replace(/^import\s[^;]*?from\s*['"][^'"]+['"];?\n/gm, '')
  .replace(/^export /gm, '');
function renderDossier(story, he) {
  const h = (type, props, ...children) => ({ type, props, children: children.flat() });
  const ctx = {
    UI_HE: he,
    h,
    t: (tag, cls, ...c) => h(tag, { className: cls }, ...c),
    fmtTime: () => '18.11 20:00',
    External: () => null,
    rwMeaningfulTimeline: () => null,
    rwSpecificUnknown: () => '',
    ...meta,
    String,
    Array,
  };
  vm.runInNewContext(dossierSrc + '\nthis.StoryDossier = StoryDossier;', ctx);
  const text = n => (typeof n === 'string' ? n : !n ? '' : (n.children || []).map(text).join(' '));
  return text(ctx.StoryDossier({ story, open: false, onToggle() {} }));
}
test('StoryDossier on live-shaped data: inflected counters, no "0 related", formatted range date', () => {
  const story = {
    id: 's1',
    title: 'T',
    summary: 'S',
    observedAt: '2026-11-18T18:00:00Z',
    type: null,
    sources: [{ url: 'https://x', label: 'X' }],
    related: [],
    eventDate: '2026-11-17/18',
  };
  const ru = renderDossier(story, false);
  assert.match(ru, /1 первоисточник(?![а-я])/);
  assert.doesNotMatch(ru, /Связанные публикации|2026-11-17\/18/);
  assert.match(ru, /17–18 нояб\./);
  const he = renderDossier({ ...story, content_language: 'ar' }, true);
  assert.match(he, /מקור אחד/);
  assert.match(he, /המקור בערבית/);
  assert.doesNotMatch(he, /[А-Яа-яЁё]/, 'no Cyrillic on the Hebrew dossier');
});

// #14: the dossier status badge must match what the dossier actually has.
test('19.11: the dossier badge says who says it, not what was not checked', async () => {
  const { sourceAttribution } = await import('../src/utils/dossierMeta.js');
  // IDF statement about its own meeting — official, no warning (owner screenshot).
  assert.deepEqual(sourceAttribution([{ url: 'https://www.idf.il/en/articles/2026/x' }], false), {
    level: 'official',
    warn: false,
    text: 'Официальное заявление: ЦАХАЛ',
  });
  // Treasury designation + OFAC page — one official publisher, deduplicated.
  assert.equal(
    sourceAttribution(
      [
        'https://home.treasury.gov/news/press-releases/sb0692/',
        'https://ofac.treasury.gov/recent-actions/20261118',
      ],
      false,
    ).text,
    'Официальное заявление: Минфин США',
  );
  // A single newspaper.
  assert.deepEqual(sourceAttribution([{ url: 'https://www.timesofisrael.com/liveblog-1/' }], false), {
    level: 'single',
    warn: false,
    text: 'Сообщение: timesofisrael.com',
  });
  // The monitor may name the speaker: IDF statement carried by Times of Israel.
  assert.equal(
    sourceAttribution(
      [{ url: 'https://www.timesofisrael.com/x', kind: 'official', publisher: 'ЦАХАЛ' }],
      false,
    ).text,
    'Официальное заявление: ЦАХАЛ',
  );
  // One side about another — the only warning.
  const claim = sourceAttribution(
    [
      { url: 'https://www.tasnimnews.com/x', kind: 'party_claim', publisher: 'КСИР' },
      'https://www.reuters.com/x',
    ],
    false,
  );
  assert.equal(claim.level, 'claim');
  assert.equal(claim.warn, true);
  assert.equal(claim.text, 'Заявление стороны: КСИР');
  // Several outlets.
  assert.equal(
    sourceAttribution(
      ['https://www.reuters.com/a', 'https://apnews.com/b', 'https://home.treasury.gov/c'],
      false,
    ).text,
    'Источники: reuters.com, apnews.com, Минфин США',
  );
  assert.deepEqual(sourceAttribution([], false), { level: 'none', warn: true, text: 'Источник не указан' });
  for (const x of [[], ['https://www.idf.il/a'], ['https://www.reuters.com/a', 'https://apnews.com/b']])
    assert.doesNotMatch(sourceAttribution(x, true).text, /[Ѐ-ӿ]/);
  // No leftover "not confirmed" boilerplate anywhere in the site sources.
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const walk = d =>
    readdirSync(d).flatMap(f =>
      statSync(d + '/' + f).isDirectory() ? (f === 'legacy' ? [] : walk(d + '/' + f)) : [d + '/' + f],
    );
  for (const f of walk(new URL('../src', import.meta.url).pathname).filter(
    f => f.endsWith('.js') && !f.endsWith('/utils/unknowns.js'),
  ))
    // unknowns.js filters such placeholders out
    assert.doesNotMatch(
      readFileSync(f, 'utf8'),
      /без независимого подтверждения|не независимое подтверждение|Статус подтверждения|не подтверждает (?:событие|факт)|ללא אימות עצמאי|אינו אימות עצמאי/,
      f,
    );
});
