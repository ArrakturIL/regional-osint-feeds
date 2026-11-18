// B3: entity glossary. One generic check replaces hand-written per-name rules:
// if the source names an entity, the translation must carry its correct form.
// Source patterns cover RU/EN (RU stems allow case endings); Hebrew patterns
// are substrings so attached prefixes (ה/ו/ב/ל/מ/ש/כ) are accepted.
// Adding an entity = adding one entry + a test case, no new code.
// Legacy codes (first 7) are kept: D1 attempt history and tests refer to them.
// RU forms (B3 part 2) were checked on 600 live RU translations. Reuters has no
// RU form on purpose: RU summaries drop the "(Reuters) -" dateline, and the
// article source is shown separately.
const L = '(?<![\\p{L}])',
  R = '(?![\\p{L}])';
const src = alts => new RegExp(L + '(?:' + alts + ')' + R, 'iu');

export const ENTITIES = [
  {
    id: 'irgc',
    code: 'irgc_actor_missing',
    source:
      /(?<![\p{L}])(?:КСИР|IRGC)(?![\p{L}])|Islamic Revolutionary Guard(?:s| Corps)?|Revolutionary Guards/iu,
    he: /(?:משמר(?:ות)?\s+(?:ה)?מהפכ[\p{L}]*|IRGC)/iu,
    ru: /КСИР|Корпус\p{L}*\s+страж|Страж\p{L}*\s+(?:исламской\s+)?революци|Революционн\p{L}*\s+гварди|IRGC/iu,
  },
  {
    id: 'katz',
    code: 'katz_name_corrupted',
    source: /(?:^|[^\p{L}])(?:Кац|Katz)(?=$|[^\p{L}])/iu,
    he: /(?:כ[״׳"']?ץ|Katz)/iu,
    ru: /Кац|Katz/u,
  },
  {
    id: 'allies',
    code: 'allies_relation_changed',
    source:
      /(?:^|[^\p{L}])(?:союзник[\p{L}]*|allies|allied\s+(?:states?|countries|governments?))(?=$|[^\p{L}])/iu,
    he: /(?:בעל(?:י|ות)?\s+(?:ה)?ברית|בני\s+ברית|בנות\s+ברית|בעלות\s+הברית)/iu,
    ru: /союзни/iu,
  },
  {
    id: 'idf',
    code: 'idf_actor_missing',
    source: /(?:ЦАХАЛ|(?<![\p{L}])IDF(?![\p{L}]))/iu,
    he: /(?:צה[״"']?ל|IDF|צבא\s+ההגנה\s+לישראל)/iu,
    ru: /ЦАХАЛ|Арми\p{L}*\s+(?:обороны\s+)?Израил|Израильск\p{L}*\s+(?:военн|арми)|Генштаб|IDF/iu,
  },
  {
    id: 'netanyahu',
    code: 'netanyahu_name_missing',
    source: /(?:Нетаньяху|Netanyahu)/iu,
    he: /(?:נתניהו|Netanyahu)/iu,
    ru: /Нетаньяху|Netanyahu/iu,
  },
  {
    id: 'reuters',
    code: 'reuters_attribution_missing',
    source: /(?:^|[^\p{L}])(?:Reuters|Рейтерс)(?=$|[^\p{L}])/iu,
    he: /(?:רויטרס|Reuters)/iu,
  },
  {
    id: 'raf_fairford',
    code: 'raf_misidentified',
    source: /(?:RAF\s+Fairford|баз[аеуы]\s+RAF\s*Fairford)/iu,
    he: /(?:\bRAF\b|חיל\s+האוויר\s+המלכותי)/iu,
    ru: /RAF|Королевск\p{L}*\s+ВВС/iu,
  },
  {
    id: 'hezbollah',
    code: 'hezbollah_name_missing',
    source: src('Hezbollah|Hizbullah|Hizballah|Хезболл\\p{L}{0,3}|Хизбалл\\p{L}{0,3}'),
    he: /חיזבאללה|חזבאללה|Hezbollah/iu,
    ru: /Хезболл|Хизбалл/iu,
  },
  {
    id: 'hamas',
    code: 'hamas_name_missing',
    source: src('Hamas|ХАМАС\\p{L}{0,3}'),
    he: /חמאס|Hamas/iu,
    ru: /ХАМАС/iu,
  },
  {
    id: 'houthis',
    code: 'houthis_name_missing',
    source: src('Houthis?|Huthis?|хусит\\p{L}{0,3}|Ansar\\s+Allah|Ансар\\s+Алл\\p{L}{0,2}'),
    he: /חות['׳]?י|אנצאר\s+אללה|Houthi/iu,
    ru: /хусит|Ансар\s+Алл/iu,
  },
  {
    id: 'hormuz',
    code: 'hormuz_name_missing',
    source: src('Hormuz|Ормуз\\p{L}{0,3}|Хормуз\\p{L}{0,3}'),
    he: /הורמוז|Hormuz/iu,
    ru: /Ормуз|Хормуз/iu,
  },
  {
    id: 'isfahan',
    code: 'isfahan_name_missing',
    source: src('Isfahan|Esfahan|Исфахан\\p{L}{0,3}'),
    he: /אי?ספהאן|Isfahan|Esfahan/iu,
    ru: /Исфахан/iu,
  },
  {
    id: 'khamenei',
    code: 'khamenei_name_missing',
    source: src('Khamenei|Хаменеи'),
    he: /ח['׳]?אמנאי|חמינאי|Khamenei/iu,
    ru: /Хаменеи/iu,
  },
  {
    id: 'west_bank',
    code: 'west_bank_name_missing',
    source: src('West\\s+Bank|Западн\\p{L}*\\s+берег\\p{L}*|Иуде\\p{L}*\\s+и\\s+Самари\\p{L}*'),
    he: /גדה\s+(?:ה)?מערבית|יהודה\s+ושומרון|West\s+Bank/iu,
    ru: /Западн\p{L}*\s+берег|Иуде\p{L}*\s+и\s+Самари/iu,
  },
];

// First entity named in `source` whose correct form is absent from `translated`.
// Entities without forms for the target language are skipped, not failed.
// Target language follows the translation's script; Latin-only falls back to he (legacy).
export const targetLanguage = text =>
  /\p{Script=Hebrew}/u.test(text) ? 'he' : /\p{Script=Cyrillic}/u.test(text) ? 'ru' : 'he';
export function entityIssue(source, translated, target = targetLanguage(translated)) {
  for (const e of ENTITIES) {
    const want = e[target];
    if (want && e.source.test(source) && !want.test(translated)) return e.code;
  }
  return null;
}
