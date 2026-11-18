// B3 part 2: meaning invariants as data.
//
// Each rule names a known, evidenced high-impact distortion. A rule fires when
// the source matches `source` (and not `sourceUnless`), and the target, for
// the target language (`ru`/`he`) or for any language (`any`):
//   - contains `forbid` (unless it also contains `unless`), or
//   - lacks `require`.
// A non-null code only quarantines a candidate for review; it is not machine
// fact-checking. Source and target are untrusted input.
// Codes are stable: D1 attempt history refers to them.
// Note: JavaScript \b is ASCII-only, so Hebrew patterns never use it.

import {targetLanguage} from './glossary.mjs';

const LABOR_CUES = /\b(?:unions?|workers?|employees?|teachers?|doctors?|nurses?|pilots?|dockers?|labou?r|industrial|hunger|general\s+strikes?|walk-?outs?|histadrut|wages?|pickets?)\b|профсоюз|забастов/iu;
const WAR_CONTEXT = /\b(?:Israeli|Israel|Iran|Iranian|Hamas|IDF|Gaza|military|airstrikes?|aircraft|air|ballistic|missiles?|bombs?|bombing|attack|war|troops?|army|Hezbollah|IRGC|US|U\.S\.|American|Bahrain|hospital|killed|drones?|targets?|artillery)\b|(?:удар|авиаудар|обстрел)[\p{L}]*/iu;

const militaryStrikeSource = s =>
  (/\b(?:strikes?|airstrikes?)\b/iu.test(s) && WAR_CONTEXT.test(s)) ||
  /(?:^|[^\p{L}])(?:удар|авиаудар|обстрел)[\p{L}]*/iu.test(s);

// "To strike a naval mine" = collide with an explosive sea mine. Tanker
// headlines often omit "naval"; vessel + waterway context keeps ordinary
// mining out.
const vesselMineCollision = s =>
  /\b(?:tankers?|vessels?|ships?)\b.{0,90}\b(?:strike|strikes|struck|hit|hits)\s+(?:a\s+|the\s+)?mines?\b/iu.test(s) &&
  /\b(?:Strait|Hormuz|Gulf|naval|sea|waters)\b/iu.test(s);
const seaMineSource = s =>
  /(?:\b(?:naval|sea)\s+mines?\b|морск[\p{L}]*\s+мин[\p{L}]*)/iu.test(s) || vesselMineCollision(s);
const mineCollisionSource = s =>
  /(?:\b(?:strike|strikes|striking|struck|hit|hits|hitting|collid\w*\s+with)\s+(?:a\s+|the\s+)?(?:naval|sea)\s+mine\b|столкнул\w*\s+с\s+морск\w*\s+мин)/iu.test(s) ||
  vesselMineCollision(s);

const RU_CONDITION = /(?:если\s+не|при\s+отсутствии|без\s+новых?\s+провокац|пока\s+не|при\s+условии\s+отсутствия)/iu;
const HE_CONDITION = /(?:אם\s+לא|בתנאי\s+שלא|כל\s+עוד\s+לא|ללא\s+פרובוקציות|בהיעדר\s+פרובוקציות|אלא\s+אם)/u;
const BARRING = /\bbarring\s+(?:any\s+|further\s+|new\s+){0,3}provocations?\b/iu;

export const MEANING_RULES = [
  {code: 'military_strikes_misread_as_labor_action', source: militaryStrikeSource, sourceUnless: LABOR_CUES,
    he: {forbid: /שבית[\p{L}]*/u}, ru: {forbid: /забастовк[\p{L}]*/iu}},
  {code: 'naval_mine_misread', source: seaMineSource,
    ru: {forbid: /(?:шахт[а-яё]*|рудник[а-яё]*)/iu},
    he: {forbid: /מכרות|מכרה/u, unless: /מוקש(?:ים)?/u}},
  {code: 'mine_collision_reframed_as_attack', source: mineCollisionSource,
    ru: {forbid: /(?:^|[^\p{L}])(?:атак[а-яё]*|напад[а-яё]*|напал[а-яё]*|напас[а-яё]*|обстрел[а-яё]*)/iu},
    he: {forbid: /(?:תקפו|תקפה|תקף|לתקוף|מתקיפ[֐-׿]*|תוקף|תוקפת|תוקפים|תוקפות)\s+.{0,30}(?:מוקש|מכרה|מכרות)/u},
    any: {forbid: /\b(?:attacked|assaulted)\b/iu}},
  // The US stays the actor of a surprise strike feared by Israel.
  {code: 'us_strike_actor_inverted',
    source: /(?:\bIsrael\b.{0,50}\bfears?\b.{0,60}\b(?:surprise|sudden)\s+(?:U\.?S\.?|American)\s+(?:air\s+)?strike\b|Израил[\p{L}]*\s+опаса[\p{L}]*.{0,70}внезапн[\p{L}]*\s+удар[\p{L}]*\s+США)/iu,
    he: {forbid: /(?:להפתיע|מפתיע\w*|מפתיעה)\s+את\s+(?:ארה[״"']?ב|ארצות\s+הברית)/u},
    ru: {forbid: /Израил[а-яё]*.{0,55}(?:боится|опасается|опасался).{0,40}удивить\s+США/iu}},
  // "Barring provocations" is a condition ("unless"), not a prohibition.
  {code: 'barring_condition_inverted', source: BARRING,
    ru: {forbid: /(?:запретил|запретит|запрещае|запрет)/iu, unless: RU_CONDITION},
    he: {forbid: /(?:אסר|אסרה|אוסרת|לאסור|האיסור)/u, unless: HE_CONDITION}},
  {code: 'barring_condition_missing', source: BARRING, ru: {require: RU_CONDITION}, he: {require: HE_CONDITION}},
  // "May postpone" is a possibility, not a decision.
  {code: 'conditional_modality_missing', source: /\b(?:may|might|could)\s+(?:postpone|delay|defer|hold\s+off)\b/iu,
    ru: {require: /(?:может|могут|возможно|вероятно|не исключает|допускает|предположительно)/iu},
    he: {require: /(?:עשוי\w*|יכול\w*|ייתכן|יתכן|אפשרות|צפוי\w*|עשויה)/u}},
  {code: 'iran_replaced_with_jordan', source: /(?:\bIran(?:ian)?\b|Иран[\p{L}]*)/iu,
    sourceUnless: /(?:\bJordan(?:ian)?\b|Иордан[\p{L}]*)/iu,
    he: {forbid: /(?:ירד(?:ן|נ[\p{L}]*)|\bJordan(?:ian)?\b)/iu}, ru: {forbid: /Иордан[\p{L}]*/iu}},
  {code: 'responsibility_negation_inverted',
    source: /(?:\bfully\s+responsible\b|\bfull\s+responsibility\b|нес[её]т\s+полн[\p{L}]*\s+ответственн)/iu,
    he: {forbid: /(?:לא|אינו|אינה|אינם)\s+[^.]{0,35}(?:אחראי|אחריות|נושא|נושאת)/u},
    ru: {forbid: /не\s+(?:нес[её]т|отвеча[\p{L}]*)\s+[^.]{0,35}ответствен/iu}},
  // Ballistic and tactical missiles are not interchangeable.
  {code: 'ballistic_missile_type_changed', source: /\bballistic\b|баллистическ/iu,
    he: {require: /בליסט/u}, ru: {require: /баллист/iu}},
  // Known erroneous expansion of "RAF" to the Hebrew abbreviation for PM.
  {code: 'raf_expanded_to_prime_minister', source: /RAF\s+Fairford/iu, he: {forbid: /רה[״"'׳]{1,3}ם/u}},
  // The IRGC Navy is a distinct unit; do not infer the Iranian navy.
  {code: 'unsupported_iranian_navy_actor', source: /(?<![\p{L}])(?:КСИР|IRGC)(?![\p{L}])/iu,
    sourceUnless: /ВМС|военно-морск|Iranian navy|IRGC Navy/iu, he: {forbid: /חיל\s+הים\s+האיראני/u}},
  {code: 'shared_posts_missing', source: /\bshared[\s\w-]{0,50}posts?\b/iu,
    he: {require: /פוסטים|פרסומ|שיתפ/u}, ru: {require: /пост|публикац|делилс/iu}},
];

const sourceMatches = (rule, s) =>
  (typeof rule.source === 'function' ? rule.source(s) : rule.source.test(s)) &&
  !(rule.sourceUnless && rule.sourceUnless.test(s));

function targetViolates(spec, t) {
  if (!spec || (spec.unless && spec.unless.test(t))) return false;
  if (spec.forbid && spec.forbid.test(t)) return true;
  return Boolean(spec.require && !spec.require.test(t));
}

export function semanticMeaningIssue(sourceText, targetText, lang = targetLanguage(String(targetText || ''))) {
  const source = String(sourceText || ''), target = String(targetText || '');
  if (!source.trim() || !target.trim()) return null;
  for (const rule of MEANING_RULES) {
    if (sourceMatches(rule, source) && (targetViolates(rule[lang], target) || targetViolates(rule.any, target)))
      return rule.code;
  }
  return null;
}

// Kept for callers that only need the false-friend check.
export function militaryStrikeMisread(sourceText, targetText) {
  const lang = targetLanguage(String(targetText || ''));
  return semanticMeaningIssue(sourceText, targetText, lang) === 'military_strikes_misread_as_labor_action';
}
