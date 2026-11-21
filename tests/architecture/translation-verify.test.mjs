// B3 part 2: one verify for every translation path.
// Before B3 the same meaning rules lived in three copies (fact-guard,
// news-mirror validateCandidate, semantic-meaning) with different language
// coverage; analysts had none. These tests pin one verdict for all paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { translationIssue, MEANING_RULES } from '../../backend/editor/src/translations/verify.mjs';
import { factualTranslationIssue } from '../../backend/editor/src/translations/fact-guard.mjs';
import { validateCandidate } from '../../backend/editor/src/translations/news-mirror.mjs';
import { validateTranslation } from '../../backend/editor/src/analysts/translation.mjs';

const o = title => ({ title, body: '', comment: '' });

// [source, target, lang, expected code or null]
const CASES = [
  // Iran must not become Jordan, in either target language.
  [
    'Iran threatens to close the strait',
    'Иордания угрожает закрыть пролив',
    'ru',
    'iran_replaced_with_jordan',
  ],
  ['Iran threatens to close the strait', 'ירדן מאיימת לסגור את המצר', 'he', 'iran_replaced_with_jordan'],
  ['Iran and Jordan hold talks', 'Иран и Иордания проводят переговоры', 'ru', null],
  // Ballistic classification is invariant in RU as well as HE.
  [
    'Iran launched ballistic missiles at Israel',
    'Иран выпустил ракеты по Израилю',
    'ru',
    'ballistic_missile_type_changed',
  ],
  [
    'Iran launched ballistic missiles at Israel',
    'Иран выпустил баллистические ракеты по Израилю',
    'ru',
    null,
  ],
  // Responsibility polarity, RU target.
  [
    'Hamas is fully responsible for the escalation',
    'ХАМАС не несёт ответственности за эскалацию',
    'ru',
    'responsibility_negation_inverted',
  ],
  [
    'Hamas is fully responsible for the escalation',
    'ХАМАС несёт полную ответственность за эскалацию',
    'ru',
    null,
  ],
  // Military strike from a Russian source is not a labour strike in Hebrew.
  ['Удар ЦАХАЛ по Газе', 'שביתת צה״ל בעזה', 'he', 'military_strikes_misread_as_labor_action'],
  // A genuine labour strike next to "Israeli" is not a military strike.
  ['Israeli doctors strike over wages', 'שביתת רופאים בישראל בגלל השכר', 'he', null],
  ['Israeli doctors strike over wages', 'Израильские врачи бастуют из-за зарплат', 'ru', null],
  // Glossary entities now have Russian forms too.
  ['Katz: no delay', 'Кац: задержки не будет', 'ru', null],
  ['Katz: no delay', 'Министр: задержки не будет', 'ru', 'katz_name_corrupted'],
  ['IRGC seizes a tanker', 'КСИР захватил танкер', 'ru', null],
  ['IRGC seizes a tanker', 'Иран захватил танкер', 'ru', 'irgc_actor_missing'],
  ['IDF strikes in Lebanon', 'Армия обороны Израиля наносит удары в Ливане', 'ru', null],
  ['IDF strikes in Lebanon', 'Армия наносит удары в Ливане', 'ru', 'idf_actor_missing'],
  // "Каз" is not Katz (old mirror rule matched any Каз/Кац substring).
  ['Казахстан закупил зерно', 'קזחסטן רכשה תבואה', 'he', null],
  // Shared posts (was mirror-only).
  ['He shared posts praising the attack', 'Он хвалил нападение', 'ru', 'shared_posts_missing'],
];

test('one verdict per case across verify, fact-guard and news mirror', () => {
  for (const [src, target, lang, code] of CASES) {
    assert.equal(translationIssue(src, target, lang), code, 'verify: ' + src + ' -> ' + target);
    const guard = factualTranslationIssue(o(src), o(target));
    assert.equal(guard, code ? 'title:' + code : null, 'fact-guard: ' + src + ' -> ' + target);
    assert.equal(validateCandidate(src, target, lang), !code, 'mirror: ' + src + ' -> ' + target);
  }
});

test('analyst EN->RU translations pass through the same verify', () => {
  const src = 'Iran has warned that it will respond to any attack on its nuclear facilities with force.';
  const ok = 'Иран предупредил, что ответит силой на любое нападение на свои ядерные объекты.';
  const bad = 'Иордания предупредила, что ответит силой на любое нападение на свои ядерные объекты.';
  const d = translation => ({ translation, confidence: 92, issues: [] });
  assert.ok(validateTranslation(src, d(ok), 'en'));
  assert.equal(validateTranslation(src, d(bad), 'en'), null);
});

test('every meaning rule has a stable code and at least one target form', () => {
  const codes = new Set();
  for (const r of MEANING_RULES) {
    assert.match(r.code, /^[a-z0-9_]+$/, r.code);
    assert.ok(typeof r.source === 'function' || r.source instanceof RegExp, r.code);
    assert.ok(r.ru || r.he || r.any, r.code + ' has no target check');
    codes.add(r.code);
  }
  // Codes stored in D1 attempt history stay stable.
  for (const c of [
    'military_strikes_misread_as_labor_action',
    'naval_mine_misread',
    'mine_collision_reframed_as_attack',
    'us_strike_actor_inverted',
    'barring_condition_inverted',
    'barring_condition_missing',
    'conditional_modality_missing',
    'iran_replaced_with_jordan',
    'responsibility_negation_inverted',
    'ballistic_missile_type_changed',
    'raf_expanded_to_prime_minister',
    'unsupported_iranian_navy_actor',
  ])
    assert.ok(codes.has(c), c);
});

test('RU read path: titles get the full verify, abridged bodies only meaning rules (live replay 18.11)', async () => {
  const { localizeNewsRow } = await import('../../backend/editor/src/localization/news-reader.mjs');
  const row = (headline, headline_ru, summary = '', summary_ru = '') => ({
    id: 'x',
    headline,
    headline_ru,
    summary,
    summary_ru,
    comment: '',
  });
  // Real D1 case: the actor Hamas was replaced by the IDF in the RU title.
  const swapped = await localizeNewsRow(
    null,
    row(
      'Hamas terrorist who helped abduct Adina Moshe killed in Nasser Hospital strike',
      'ЦАХАЛ сообщил о гибели участника похищения Адины Моше при ударе по больнице «Насер»',
    ),
    'ru',
  );
  assert.equal(swapped.translation_status, 'needs_review');
  assert.equal(swapped.review_reason, 'hamas_name_missing');
  assert.equal(swapped.content_language, 'en');
  // Real D1 case: the RU summary stops before the sentence naming Hormuz.
  const abridged = await localizeNewsRow(
    null,
    row(
      "'No war and no peace' cannot continue, Iraqi FM says",
      '«Ни войны, ни мира» не может продолжаться, заявил глава МИД Ирака',
      'Iraqi Foreign Minister Fuad Hussein said the situation cannot continue. Finally, he said Iraqi oil now flows through Hormuz.',
      'Глава МИД Ирака Фуад Хусейн заявил, что ситуация не может продолжаться.',
    ),
    'ru',
  );
  assert.equal(abridged.translation_status, 'available');
  // Meaning rules still apply to the body.
  const mine = await localizeNewsRow(
    null,
    row(
      'Tanker incident',
      'Инцидент с танкером',
      'Two tankers strike mines in Strait of Hormuz',
      'Два танкера нападают на мины в Ормузском проливе',
    ),
    'ru',
  );
  assert.equal(mine.review_reason, 'mine_collision_reframed_as_attack');
});

test('common RU renderings of IRGC and IDF are accepted (live replay 18.11)', () => {
  assert.equal(
    translationIssue(
      "Iran's Revolutionary Guards said they launched six drones",
      'Иранские стражи революции заявили о запуске шести беспилотников',
      'ru',
    ),
    null,
  );
  assert.equal(
    translationIssue('Revolutionary Guards blame vessels', 'Революционные гвардии обвиняют суда', 'ru'),
    null,
  );
  assert.equal(
    translationIssue('IDF troops arrested two brothers', 'Израильские военные задержали двух братьев', 'ru'),
    null,
  );
  assert.equal(
    translationIssue(
      'a bill acceptable to the IDF chief',
      'законопроект, приемлемый для начальника Генштаба',
      'ru',
    ),
    null,
  );
});

// Live 21.11: «$6.7 billion» → «6,7 млрд» was rejected three times (manual queue):
// the Russian decimal comma split 6,7 into 6 and 7. Space thousands likewise.
test('RU numbers: decimal comma and space-separated thousands are the same number; a changed number is not', () => {
  const s = '$6.7 billion flows into Jordan, funding desalination in the desert kingdom';
  assert.equal(
    validateCandidate(
      s,
      '6,7 млрд долларов поступают в Иорданию на опреснение в пустынном королевстве',
      'ru',
    ),
    true,
  );
  assert.equal(
    validateCandidate('Israel to buy 1,200 interceptors', 'Израиль купит 1 200 перехватчиков', 'ru'),
    true,
  );
  assert.equal(
    validateCandidate('Israel to buy 1,200 interceptors', 'Израиль купит 1200 перехватчиков', 'ru'),
    true,
  );
  assert.equal(
    validateCandidate(
      s,
      '7,6 млрд долларов поступают в Иорданию на опреснение в пустынном королевстве',
      'ru',
    ),
    false,
  );
  assert.equal(validateCandidate('Strike kills 6, wounds 7', 'Удар убил 6 человек, ранены 7', 'ru'), true);
});
