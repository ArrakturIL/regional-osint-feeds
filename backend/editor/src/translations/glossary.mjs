// B3: entity glossary. One generic check replaces hand-written per-name rules:
// if the source names an entity, the translation must carry its correct form.
// Source patterns cover RU/EN (RU stems allow case endings); Hebrew patterns
// are substrings so attached prefixes (ה/ו/ב/ל/מ/ש/כ) are accepted.
// Adding an entity = adding one entry + a test case, no new code.
// Legacy codes (first 7) are kept: D1 attempt history and tests refer to them.
// RU forms (B3 part 2) were checked on 600 live RU translations. Reuters has no
// RU form on purpose: RU summaries drop the "(Reuters) -" dateline, and the
// article source is shown separately.
import { WIKIDATA_ENTITIES } from './glossary-wikidata.mjs';

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
    // 22.11: «former IDF chief of staff» is «הרמטכ״ל לשעבר» in Hebrew — the
    // title already means the IDF; the job stalled on a correct translation.
    he: /(?:צה[״"']?ל|IDF|צבא\s+ההגנה\s+לישראל|רמטכ[״"']?ל|ראש\s+(?:ה)?מטה\s+(?:ה)?כללי)/iu,
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
    // 21.11: «ВВС Великобритании» / «британских ВВС» are correct too (false reject in B6).
    he: /(?:\bRAF\b|חיל\s+האוויר\s+(?:המלכותי|הבריטי))/iu,
    ru: /RAF|Королевск\p{L}*\s+ВВС|ВВС\s+Великобритани|Британск\p{L}*\s+(?:ВВС|военно-воздушн)/iu,
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
    // Hand-tuned (was Wikidata): RU news write «Исламский джихад» without
    // «Палестинский»; Wikidata has only the full RU label (live false rejects 22.11).
    id: 'pij',
    code: 'pij_name_missing',
    source: src(
      'Palestinian\\s+Islamic\\s+Jihad|Islamic\\s+Jihad|PIJ|(?:Палестинск\\p{L}*\\s+)?Исламск\\p{L}*\\s+джихад\\p{L}{0,3}|[ובהלמשכ]?ה?ג\'?יהאד\\s+ה?אסלאמי|[ובהלמשכ]?ה?גא["״]?פ',
    ),
    he: /ג'?יהאד\s+ה?אסלאמי|גא["״]?פ|Islamic\s+Jihad/iu,
    ru: /Исламск\p{L}*\s+джихад/iu,
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
  // B11 audit 21.11: the second model caught «David's Sling» → «כיפת ברזל»
  // (Iron Dome) three times; air-defence systems are now deterministic.
  {
    id: 'davids_sling',
    code: 'davids_sling_name_missing',
    source: src("David['’]?s\\s+Sling|קלע\\s+דוד|Пращ\\p{L}*\\s+Давид\\p{L}*"),
    he: /קלע\s+דוד|David['’]?s\s+Sling/iu,
    ru: /Пращ\p{L}*\s+Давид|David['’]?s\s+Sling/iu,
  },
  {
    id: 'iron_dome',
    code: 'iron_dome_name_missing',
    source: src('Iron\\s+Dome|כיפת\\s+ברזל|Железн\\p{L}*\\s+купол\\p{L}*'),
    he: /כיפת\s+ברזל|Iron\s+Dome/iu,
    ru: /Железн\p{L}*\s+купол|Iron\s+Dome/iu,
  },
  // Owner 22.11: «displaced Palestinians» came out as «перемещённые
  // палестинцы» — a calque. Russian says переселенцы / лишившиеся крова / беженцы.
  {
    id: 'displaced',
    code: 'displaced_calque',
    source: src('displaced|עקורים|עקורי'),
    he: /עקור|מפונ|פליט/iu,
    ru: /переселен|лишивш\p{L}*\s+(?:крова|дом|жиль)|беженц|покинувш\p{L}*\s+дом|бездомн|вынужденн\p{L}*\s+(?:покинуть|уйти|бежать)|перемещ\p{L}*\s+лиц/iu,
  },
  // 22.11: bounded regional names; avoid matching ordinary words.
  {
    id: 'iron_beam',
    code: 'iron_beam_name_missing',
    // Capitalized weapon name only: an ordinary "iron beam" is not a laser system.
    source: /(?<![\p{L}])(?:Iron[\s-]+Beam|Железн\p{L}*\s+луч\p{L}*|[ובהלמשכ]?מגן\s+אור)(?![\p{L}])/u,
    he: /מגן\s+אור|קרן\s+ברזל|Iron[\s-]+Beam/iu,
    ru: /Железн\p{L}*\s+луч|Маген[\s-]+Ор|Iron[\s-]+Beam/iu,
  },
  {
    id: 'centcom',
    code: 'centcom_name_missing',
    source: /(?<![\p{L}])(?:(?:US)?CENTCOM|ЦЕНТКОМ|[ובהלמשכ]?סנטקום)(?![\p{L}])/iu,
    he: /סנטקום|CENTCOM|פיקוד\s+(?:ה)?מרכז/iu,
    ru: /ЦЕНТКОМ|CENTCOM|Центральн\p{L}*\s+командовани/iu,
  },
  {
    id: 'unifil',
    code: 'unifil_name_missing',
    source: /(?<![\p{L}])(?:UNIFIL|ЮНИФИЛ|ВСООНЛ|[ובהלמשכ]?יוניפי["״]?ל)(?![\p{L}])/iu,
    he: /יוניפי["״]?ל|UNIFIL|כוח\s+(?:ה)?או["״]ם|שומרי\s+(?:ה)?שלום/iu,
    ru: /ЮНИФИЛ|ВСООНЛ|UNIFIL|миротвор\p{L}*|Временн\p{L}*\s+сил\p{L}*\s+ООН/iu,
  },
  {
    id: 'pmf',
    code: 'pmf_name_missing',
    source:
      /(?<![\p{L}])(?:Popular\s+Mobilization\s+Forces|Hashd[\s-]+(?:al[\s-]+)?Shaabi|Хашд[\s-]+(?:аш[\s-]+)?Шааби|[ובהלמשכ]?חשד\s+א[\s-]שעבי)(?![\p{L}])/iu,
    he: /חשד\s+(?:א[\s-])?שעבי|הגיוס\s+העממי|PMF/iu,
    ru: /Хашд[\s-]+(?:аш[\s-]+)?Шааби|Сил\p{L}*\s+народн\p{L}*\s+мобилизаци|PMF/iu,
  },
  {
    id: 'knesset',
    code: 'knesset_name_missing',
    source: /(?<![\p{L}])(?:Knesset|Кнессет\p{L}{0,2})(?![\p{L}])/iu,
    he: /כנסת|Knesset|הפרלמנט/iu,
    ru: /Кнессет|Knesset|парламент\p{L}*\s+Израил|парламент\p{L}*/iu,
  },
  {
    id: 'thaad',
    code: 'thaad_name_missing',
    source: /(?<![\p{L}])(?:THAAD|ТХААД|[ובהלמשכ]?תאא["״]?ד)(?![\p{L}])/iu,
    he: /תאא["״]?ד|THAAD/iu,
    ru: /THAAD|ТХААД/iu,
  },
  {
    id: 'f35i',
    code: 'f35i_name_missing',
    source: /(?<![\p{L}])(?:F[\s-]?35I\b|Ф[\s-]?35I\b|[ובהלמשכ]?אדיר\s+F[\s-]?35)(?![\p{L}])/iu,
    he: /אדיר|F[\s-]?35I/iu,
    ru: /(?:F|Ф)[\s-]?35I|Адир/iu,
  },
  {
    id: 'shahed_drone',
    code: 'shahed_drone_name_missing',
    source:
      /(?<![\p{L}])(?:Shahed[\s-]?(?:\d{2,3}|drone|UAV)|Шахед[\s-]?(?:\d{2,3}|дрон|БПЛА)|[ובהלמשכ]?שאהד[\s-]?\d{2,3})(?![\p{L}])/iu,
    he: /שאהד|שהאד|Shahed/iu,
    ru: /Шахед|Shahed/iu,
  },
  {
    id: 'arrow_missile',
    code: 'arrow_missile_name_missing',
    source:
      /(?<![\p{L}])(?:Arrow[\s-]?(?:2|3)\b|Arrow\s+(?:missile|interceptor|air[\s-]defen[cs]e\s+system)|Хец[\s-]?[23]\b|[ובהלמשכ]?חץ[\s-]?[23])(?![\p{L}])/iu,
    // The source may say just "Arrow interceptor": the number is not required then.
    // 23.11: «מערכת ההגנה מפני טילים חץ» — «חץ» a few words from a missile or
    // defence word counts; a bare «חץ» (also just "arrow") does not.
    he: /חץ[\s-]?[23]|(?:מערכת|טיל\p{L}*|מיירט\p{L}*)\s+ה?חץ|(?:טיל|יירוט|מיירט|הגנ)[\p{L}\s,־-]{0,40}?(?<!\p{L})ה?חץ(?!\p{L})|(?<!\p{L})ה?חץ(?!\p{L})[\p{L}\s,־-]{0,30}?(?:טיל|יירוט|מיירט|הגנ)|Arrow/iu,
    ru: /Хец|Arrow|«Стрел|Стрел\p{L}*[\s-]?[23]/iu,
  },
  {
    id: 'khan_younis',
    code: 'khan_younis_name_missing',
    source:
      /(?<![\p{L}])(?:Khan[\s-]+You?nis|Khan[\s-]+Yunis|Хан[\s-]+Юнис\p{L}{0,3}|[ובהלמשכ]?חאן[\s-]+יונס)(?![\p{L}])/iu,
    he: /חאן[\s-]+יונס|Khan[\s-]+You?nis/iu,
    ru: /Хан[\s-]+Юнис|Хан[\s-]+Юнус/iu,
  },
  {
    id: 'rafah',
    code: 'rafah_name_missing',
    source: /(?<![\p{L}])(?:Rafah|Рафах\p{L}{0,3}|[ובהלמשכ]?רפיח)(?![\p{L}])/iu,
    he: /רפיח|Rafah/iu,
    ru: /Рафах|Rafah/iu,
  },
  {
    id: 'jabalia',
    code: 'jabalia_name_missing',
    source: /(?<![\p{L}])(?:Jabalia|Jabalya|Джабали\p{L}{0,3}|[ובהלמשכ]?ג[׳']?באליה)(?![\p{L}])/iu,
    he: /ג[׳']?באליה|Jabalia/iu,
    ru: /Джабали\p{L}*|Jabalia/iu,
  },
  {
    id: 'jenin',
    code: 'jenin_name_missing',
    source: /(?<![\p{L}])(?:Jenin|Дженин\p{L}{0,3}|[ובהלמשכ]?ג[׳']?נין)(?![\p{L}])/iu,
    he: /ג[׳']?נין|Jenin/iu,
    ru: /Дженин|Jenin/iu,
  },
  {
    id: 'nablus',
    code: 'nablus_name_missing',
    source: /(?<![\p{L}])(?:Nablus|Шхем\p{L}{0,3}|Наблус\p{L}{0,3}|[ובהלמשכ]?שכם)(?![\p{L}])/iu,
    he: /שכם|Nablus/iu,
    ru: /Шхем|Наблус|Nablus/iu,
  },
  {
    id: 'ramallah',
    code: 'ramallah_name_missing',
    source: /(?<![\p{L}])(?:Ramallah|Рамалл\p{L}{0,3}|[ובהלמשכ]?רמאללה)(?![\p{L}])/iu,
    he: /רמאללה|Ramallah/iu,
    ru: /Рамалл|Ramallah/iu,
  },
  {
    id: 'hebron',
    code: 'hebron_name_missing',
    source: /(?<![\p{L}])(?:Hebron|Хеврон\p{L}{0,3}|[ובהלמשכ]?חברון)(?![\p{L}])/iu,
    he: /חברון|Hebron/iu,
    ru: /Хеврон|Hebron/iu,
  },
  {
    id: 'litani',
    code: 'litani_name_missing',
    source: /(?<![\p{L}])(?:Litani(?:\s+River)?|Литани|[ובהלמשכ]?ליטני)(?![\p{L}])/iu,
    he: /ליטני|Litani/iu,
    ru: /Литани|Litani/iu,
  },
  {
    id: 'hodeidah',
    code: 'hodeidah_name_missing',
    source:
      /(?<![\p{L}])(?:Hodeidah|Hudaydah|Ходейд\p{L}{0,3}|Худайд\p{L}{0,3}|[ובהלמשכ]?חודיידה)(?![\p{L}])/iu,
    he: /חודיידה|חודידה|Hodeidah/iu,
    ru: /Ходейд|Худайд|Hodeidah/iu,
  },
  {
    id: 'bab_mandeb',
    code: 'bab_mandeb_name_missing',
    source:
      /(?<![\p{L}])(?:Bab[\s-]+(?:el[\s-]+|al[\s-]+)?Mandeb|Баб[\s-]+эль[\s-]+Мандеб|[ובהלמשכ]?באב[\s-]+אל[\s-]+מנדב)(?![\p{L}])/iu,
    he: /באב[\s-]+אל[\s-]+מנדב|Bab[\s-]+(?:el[\s-]+)?Mandeb/iu,
    ru: /Баб[\s-]+эль[\s-]+Мандеб|Баб[\s-]+аль[\s-]+Мандеб|Bab[\s-]+(?:el[\s-]+)?Mandeb/iu,
  },
  {
    id: 'gofman',
    code: 'gofman_name_missing',
    source:
      /(?<![\p{L}])(?:Roman\s+Gofman|Roman\s+Hofman|Роман\s+Гофман|[ובהלמשכ]?רומן\s+גופמן)(?![\p{L}])/iu,
    he: /גופמן|גופמאן|Roman\s+(?:Gofman|Hofman)|ראש\s+המוסד/iu,
    ru: /Гофман|Гофманн|Roman\s+(?:Gofman|Hofman)|глав\p{L}*\s+Моссад/iu,
  },
  {
    id: 'zini',
    code: 'zini_name_missing',
    source: /(?<![\p{L}])(?:David\s+Zini|Давид\s+Зини|[ובהלמשכ]?דוד\s+זיני)(?![\p{L}])/iu,
    he: /דוד\s+זיני|זיני|David\s+Zini|ראש\s+(?:ה)?שב["״]?כ/iu,
    ru: /Давид\s+Зини|Зини|David\s+Zini|глав\p{L}*\s+(?:ШАБАК|Шин[\s-]?Бет)/iu,
  },
  {
    id: 'cooper_centcom',
    code: 'cooper_centcom_name_missing',
    source: /(?<![\p{L}])(?:Brad\s+Cooper|Брэд\s+Купер|[ובהלמשכ]?בראד\s+קופר)(?![\p{L}])/iu,
    he: /בראד\s+קופר|ברד\s+קופר|Brad\s+Cooper|מפקד\s+(?:סנטקום|פיקוד\s+המרכז)/iu,
    ru: /Брэд\s+Купер|Бред\s+Купер|Brad\s+Cooper|командующ\p{L}*\s+(?:ЦЕНТКОМ|CENTCOM)/iu,
  },
];

// B11 part 1: entities whose names come from Wikidata (labels + aliases in
// en/ru/he, glossary-wikidata.mjs, generated by scripts/build_wikidata_glossary.py).
// Source: English whole words (acronyms case-sensitive), Russian stems, Hebrew
// substrings. Target: its RU/HE forms or the original Latin form.
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const gap = '[-\\s\u2010-\u2014]+';
// Case endings: drop up to two final vowels/й/ь, keep at least four letters
// (Саудовская → Саудовск matches Саудовской, Израиль → Израил).
const ruStem = w => {
  const stem = w.replace(/[аяоеиыуюьй]{1,2}$/iu, '');
  if (stem.length >= 4) return stem;
  const one = w.replace(/[аяоеиыуюьй]$/iu, '');
  return one.length >= 3 ? one : w; // Газа → Газ (Газе), Доха → Дох
};
const ruForm = f =>
  f
    .split(/[-\s]+/u)
    .map(w => esc(ruStem(w)) + '\\p{L}{0,4}')
    .join(gap);
// Source side (does the original name the entity?): the stem takes only case
// endings and ends the word, so «Сана» is not «санкции», «Европа» is not
// «европейские», «Россия» is not «российский» (live false rejections 20.11).
// Foreign names ending in -о/-и/-у/-ю do not decline: «Фордо» is not «Форд»,
// «НАТО» is not «натиск».
const RU_ENDING = '[аяоеёиыуюьй]{0,3}(?:м|х|ми|в)?(?!\\p{L})';
const ruSourceForm = f =>
  f
    .split(/[-\s]+/u)
    .map(w => (/[оиую]$/iu.test(w) ? esc(w) + '(?!\\p{L})' : esc(ruStem(w)) + RU_ENDING))
    .join(gap);
// Final letters turn regular inside a longer word: איראן → איראנית.
const FINAL = { ך: '[ךכ]', ם: '[םמ]', ן: '[ןנ]', ף: '[ףפ]', ץ: '[ץצ]' };
// A leading definite article yields to a prefix: המוסד → במוסד, המפרץ → במפרץ.
// A final ה yields to the adjective: אמריקה → אמריקאית, סעודיה → סעודי.
const heForm = f =>
  esc(f.length > 3 ? f.replace(/^ה(?=\p{L}{2})/u, '') : f)
    .replace(/(\p{L}{2})ה(?=$|\s)/gu, '$1(?:ה|א|י)')
    .replace(/[ךםןףץ]/gu, c => FINAL[c])
    // Spelling variants: doubled vav/yod (כווית / כוויית).
    .replace(/ו+/gu, 'ו{1,2}')
    .replace(/י+/gu, 'י{1,2}')
    .replace(/["״]/gu, '["״]?')
    .replace(/['׳]/gu, "['׳]?")
    .replace(/[-\s]+/gu, gap);
const latinForm = f => esc(f).replace(/[-\s]+/gu, gap);
function fromWikidata(e) {
  const acronyms = e.en.filter(f => /^[A-Z]{2,5}$/.test(f)),
    words = e.en.filter(f => !acronyms.includes(f));
  const any = list => list.filter(Boolean);
  const latin = any([
    // "Iran's Ghalibaf" → "Ghalibaf": a possessive does not demand the name.
    words.length && new RegExp(L + '(?:' + words.map(latinForm).join('|') + ')' + R + "(?!['’]s)", 'iu'),
    acronyms.length && new RegExp(L + '(?:' + acronyms.join('|') + ')' + R, 'u'),
  ]);
  // A translation may name a multi-word entity by its proper-noun part
  // ("в Газе" for «сектор Газа», «Аравии» for «Саудовская Аравия»).
  const ruParts = e.ru.flatMap(f =>
    /[\s-]/u.test(f) ? f.split(/[\s-]+/u).filter(w => /^\p{Lu}\p{L}{3,}$/u.test(w)) : [],
  );
  const ruSource = new RegExp(L + '(?:' + e.ru.map(ruSourceForm).join('|') + ')', 'iu'),
    ruTarget = new RegExp([...e.ru, ...ruParts].map(ruForm).join('|'), 'iu'),
    he = new RegExp(e.he.map(heForm).join('|'), 'u'),
    // Live 21.11: in the source a Hebrew name is a whole word with at most a
    // one-letter prefix, else «מדווחים» reads as Doha (דוחה).
    heSource = new RegExp(L + '[בהולמשכ]?(?:' + e.he.map(heForm).join('|') + ')' + R, 'u'),
    // Last word of a multi-word Hebrew name (דונלד טראמפ → טראמפ).
    heParts = e.he.flatMap(f => (/\s/u.test(f) ? [f.split(/\s+/u).pop()] : [])).filter(w => w.length >= 3),
    heTarget = heParts.length ? new RegExp([...e.he, ...heParts].map(heForm).join('|'), 'u') : he;
  const either = (re, rest) => ({ test: t => re.test(t) || rest.some(r => r.test(t)) });
  return {
    id: e.id,
    code: e.id + '_name_missing',
    wikidata: e.qid,
    source: { test: t => latin.some(r => r.test(t)) || ruSource.test(t) || heSource.test(t) },
    he: either(heTarget, latin),
    ru: either(ruTarget, latin),
  };
}
const HAND_IDS = new Set(ENTITIES.map(e => e.id));
for (const e of WIKIDATA_ENTITIES) if (!HAND_IDS.has(e.id)) ENTITIES.push(fromWikidata(e));

// First entity named in `source` whose correct form is absent from `translated`.
// Entities without forms for the target language are skipped, not failed.
// Target language follows the translation's script; Latin-only falls back to he (legacy).
export const targetLanguage = text =>
  /\p{Script=Hebrew}/u.test(text) ? 'he' : /\p{Script=Cyrillic}/u.test(text) ? 'ru' : 'he';
// Wikidata entities are checked on headline-length text only (≤ 160 chars):
// summaries and bodies legitimately drop names (live check 19.11, B11).
export const WIKIDATA_MAX_SOURCE = 160;
// Hand-tuned entities run before the semantic-meaning rules; Wikidata names
// run after them (wikidataEntityIssue), so a specific verdict such as
// iran_replaced_with_jordan is not masked by a generic name_missing.
function firstMissing(source, translated, target, wikidata) {
  if (wikidata && String(source).length > WIKIDATA_MAX_SOURCE) return null;
  for (const e of ENTITIES) {
    if (Boolean(e.wikidata) !== wikidata) continue;
    const want = e[target];
    if (want && e.source.test(source) && !want.test(translated)) return e.code;
  }
  return null;
}
export const entityIssue = (source, translated, target = targetLanguage(translated)) =>
  firstMissing(source, translated, target, false);
export const wikidataEntityIssue = (source, translated, target = targetLanguage(translated)) =>
  firstMissing(source, translated, target, true);
