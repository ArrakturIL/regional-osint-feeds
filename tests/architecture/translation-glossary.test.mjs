// B3: one entity glossary replaces hand-written per-name regex rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ENTITIES, entityIssue} from '../../backend/editor/src/translations/glossary.mjs';
import {factualTranslationIssue} from '../../backend/editor/src/translations/fact-guard.mjs';

const o = title => ({title, body: '', comment: ''});

test('every glossary entity has a stable code, a source form and a Hebrew target form', () => {
  const codes = new Set();
  for (const e of ENTITIES) {
    assert.match(e.code, /^[a-z0-9_]+$/, e.id);
    assert.ok(!codes.has(e.code), 'duplicate code ' + e.code); codes.add(e.code);
    assert.ok(e.source instanceof RegExp && e.he instanceof RegExp, e.id);
  }
  // Legacy codes stay stable: D1 attempt history and tests refer to them.
  for (const c of ['irgc_actor_missing', 'katz_name_corrupted', 'allies_relation_changed', 'idf_actor_missing',
    'netanyahu_name_missing', 'reuters_attribution_missing', 'raf_misidentified']) assert.ok(codes.has(c), c);
});

const CASES = [
  // [source, good Hebrew, bad Hebrew, code]
  ['Hezbollah fires rockets at the north', 'חיזבאללה ירה רקטות לצפון', 'הארגון ירה רקטות לצפון', 'hezbollah_name_missing'],
  ['Удар по позициям «Хезболлы» на юге Ливана', 'תקיפה בעמדות של חיזבאללה בדרום לבנון', 'תקיפה בעמדות בדרום לבנון', 'hezbollah_name_missing'],
  ['Hamas rejects the proposal', 'חמאס דוחה את ההצעה', 'הארגון דוחה את ההצעה', 'hamas_name_missing'],
  ['ХАМАСа отверг предложение', 'חמאס דחה את ההצעה', 'הארגון דחה את ההצעה', 'hamas_name_missing'],
  ['Houthis claim a drone attack', "החות'ים טוענים לתקיפת כטב\"ם", 'המורדים טוענים לתקיפת כטב"ם', 'houthis_name_missing'],
  ['Tankers rerouted from the Strait of Hormuz', 'מכליות הוסטו ממצר הורמוז', 'מכליות הוסטו מהמפרץ', 'hormuz_name_missing'],
  ['Explosions reported near Isfahan', 'דווח על פיצוצים ליד אספהאן', 'דווח על פיצוצים ליד טהרן', 'isfahan_name_missing'],
  ['Khamenei warns Washington', 'חמינאי מזהיר את וושינגטון', 'המנהיג מזהיר את וושינגטון', 'khamenei_name_missing'],
  ['IDF says the strike hit a depot', 'לפי צה״ל, התקיפה פגעה במחסן', 'לפי הצבא, התקיפה פגעה במחסן', 'idf_actor_missing'],
];

test('glossary accepts correct Hebrew (incl. prefixes) and rejects a dropped entity', () => {
  for (const [src, good, bad, code] of CASES) {
    assert.equal(entityIssue(src, good, 'he'), null, 'good: ' + src);
    assert.equal(entityIssue(src, bad, 'he'), code, 'bad: ' + src);
  }
  assert.equal(entityIssue('Hezbollah statement', 'הודעה של לחיזבאללה ולחמאס', 'he'), null, 'Hebrew prefix letters');
});

test('fact-guard uses the glossary per field and keeps legacy behaviour', () => {
  assert.equal(factualTranslationIssue(o('Katz: no delay'), o('קטז: אין עיכוב')), 'title:katz_name_corrupted');
  assert.equal(factualTranslationIssue(o('Katz: no delay'), o('כ״ץ: אין עיכוב')), null);
  assert.equal(factualTranslationIssue(o('Hamas rejects the proposal'), o('הארגון דוחה את ההצעה')), 'title:hamas_name_missing');
});

test('words that merely contain an entity string do not trigger it', () => {
  assert.equal(entityIssue('Hamasaki and Hamasvili met', 'הם נפגשו', 'he'), null);
  assert.equal(entityIssue('The hormuzian dialect', 'הניב', 'he'), null);
});

test('Russian translations are checked against Russian forms', () => {
  assert.equal(entityIssue('Hezbollah fires rockets', 'Хезболла выпустила ракеты'), null);
  assert.equal(entityIssue('Hezbollah fires rockets', 'Группировка выпустила ракеты'), 'hezbollah_name_missing');
  assert.equal(entityIssue('Tankers in the Strait of Hormuz', 'Танкеры в Ормузском проливе'), null);
});

test('West Bank is not "western bank" (live Helsinki error 17.11)', () => {
  const src = 'Border Police arrest suspects in overnight West Bank raid';
  assert.equal(entityIssue(src, 'משטרת הגבול עצרה חשודים בפשיטת בנק מערבי בלילה'), 'west_bank_name_missing');
  assert.equal(entityIssue(src, 'משטרת הגבול עצרה חשודים בפשיטה לילית בגדה המערבית'), null);
  assert.equal(entityIssue(src, 'Пограничная полиция задержала подозреваемых на Западном берегу'), null);
});
