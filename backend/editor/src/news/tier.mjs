// B5: importance tiers (owner decision, 18.11).
//   urgent    — threat to life and safety: strikes and shelling in the core
//               region, Home Front Command orders, closed airspace or Hormuz;
//   important — decisions of governments and armies, escalation signals;
//   normal    — everything else.
// Deterministic and explainable: every tier comes with a reason code. Builds
// on the existing event analysis (topic, type, score) instead of a new model.
import { analyze } from './events.mjs';

export const TIERS = Object.freeze(['urgent', 'important', 'normal']);
export const TIER_RANK = Object.freeze({ urgent: 0, important: 1, normal: 2 });
// Owner SLA, minutes from collection to the page language; normal: by quota.
export const TIER_SLA_MIN = Object.freeze({ urgent: 15, important: 60, normal: null });

// Explicit safety signals in EN/HE/RU/AR. Each one alone makes an item urgent.
// `sirens` counts only in the headline (live 20.11: a summary line "earlier,
// sirens sounded" or a column about alerts is not an alert now).
const TITLE_ONLY_SIGNALS = new Set(['sirens']);
const URGENT_SIGNALS = [
  [
    'home_front_command',
    /\bHome\s+Front\s+Command\b|פיקוד\s+העורף|Командовани\p{L}*\s+тыла|قيادة\s+الجبهة\s+الداخلية/iu,
  ],
  [
    'sirens',
    /\b(?:sirens?|rocket\s+alerts?|red\s+alert)\b|אזעק(?:ה|ות)|צבע\s+אדום|сирен\p{L}*|صفارات\s+الإنذار/iu,
  ],
  [
    'airspace_closed',
    /\bairspace\b.{0,40}\b(?:clos\w*|shut\w*)\b|\b(?:clos\w*|shut\w*)\b.{0,40}\bairspace\b|המרחב\s+האווירי.{0,30}(?:נסגר|סגירת|ייסגר)|(?:סגירת|נסגר)\s+המרחב\s+האווירי|воздушн\p{L}*\s+пространств\p{L}*.{0,30}закр|закр\p{L}*.{0,30}воздушн\p{L}*\s+пространств|إغلاق\s+المجال\s+الجوي/iu,
  ],
  [
    'hormuz_closed',
    /\bHormuz\b.{0,50}\b(?:clos\w*|shut\w*|block\w*)\b|\b(?:clos\w*|shut\w*|block\w*)\b.{0,50}\bHormuz\b|הורמוז.{0,30}(?:נסגר|סגירת|חסימת)|(?:סגירת|חסימת)\s+(?:מצר\s+)?הורמוז|Ормуз\p{L}*.{0,40}(?:закр|блокир)|(?:закр|блокир)\p{L}*.{0,40}Ормуз|إغلاق\s+(?:مضيق\s+)?هرمز/iu,
  ],
  [
    'missiles_at_israel',
    /\b(?:missiles?|rockets?)\b.{0,40}\b(?:at|toward|towards|into)\s+(?:central\s+|northern\s+|southern\s+)?Israel\b|טילים\s+(?:לעבר|על|אל)\s+ישראל|ракет\p{L}*.{0,30}по\s+Израил/iu,
  ],
];
const CORE_STRIKE_SCORE = 8; // strike topic + core region (see events.mjs BASE)
// The strike topic also matches background words ("attack" in a summary,
// threats, plots). Urgent needs a kinetic event in the headline itself and no
// analysis/forecast framing.
const KINETIC_TITLE =
  /\b(?:strikes?|struck|airstrikes?|attacked|shelling|shelled|bomb(?:ed|ing|ings)|(?:missile|drone|rocket)\s+(?:attacks?|fire|barrage)|intercept(?:ed|s|ion)|killed|kills|explosions?|blasts?|ramming|stabbing|shooting|terror(?:ist)?\s+attack|attacks?)\b|תקיפ|פיגוע|הפצצ|יירוט|נהרג|חוסל|פיצוץ|ירי\s+רקטות|удар|обстрел|теракт|перехват|погиб|взрыв|قصف|غارة|هجوم/iu;
// Not an event under way (live check 20.11, 17 of 28 false urgent): analysis
// and forecasts; advocacy and calls ("lobbied for strikes", "urges", "calls
// for", "warns that … should"); conditionals; plots and recruitment;
// retrospectives and reactions; Hebrew speculation ("weighing a strike",
// "chances of a strike", "the strike window", rumours).
const NOT_EVENT_TITLE = new RegExp(
  [
    '\\b(?:analysis|opinion|plots?|plotting|planning|planned|plans?|threat|threatens?|could|may|might|would|should|if|scenario|explainer|how|why|what|fears?|frets?|warns?|crisis|ability|risks?)\\b',
    '\\b(?:lobb(?:y|ies|ied|ying)|advocat\\w*|urg(?:e|es|ed|ing)|call(?:s|ed|ing)?\\s+for|push(?:es|ed|ing)?\\s+for|press(?:es|ed|ing)?\\s+for|weigh(?:s|ed|ing)?|consider(?:s|ed|ing)?|mulls?|mulling|recruit\\w*|foil(?:s|ed)?|alarmed|families|anniversary|memorial|commemorat\\w*)\\b',
    'ניתוח|תרחיש|מאיימ|מתכננ|בוחנ|שוקל|מעריכ|הסיכוי|סיכויי|שמועות|השמועה|המועד|חלון\\s+ה|יגלה|שנה\\s+(?:לאחר|אחרי)|יום\\s+השנה|אזכרה|קורא(?:ים|ת)?\\s+ל',
    'анализ|угроз|может|план|призыва\\p{L}*|призвал\\p{L}*|призыв|лоббир\\p{L}*|выступ\\p{L}*\\s+за|если|годовщин',
    // 21.11: talk about a topic (interviews, remarks) and attacks as the
    // backdrop of someone else's act («Swimmer braves tanker attacks»).
    '\\b(?:talks?|speaks?|spoke|interview\\w*|remarks?|podcast)\\b|\\b(?:braves?|braving|defies|defying|defied|dodg\\w*)\\b',
    'מדבר(?:ת|ים)?\\s+על|מתראיי?נ|בראיון|ריאיון|ראיון|говорит\\s+о|интервью',
  ].join('|'),
  'iu',
);
// A strike named only in an "after …" clause is background, not the event
// ("Soroka expands ER after Iranian missile strike"; "Gulf nations attacked
// after US strikes" keeps its own verb).
// 21.11: a relative clause about the past is background too («the fire that
// killed Rabin», «…, which killed …»).
const MAIN_CLAUSE = title =>
  String(title).replace(
    /\s(?:after|following|since|despite|amid)\s.*$|\s(?:that|which|who)\s.*$|\s(?:לאחר|אחרי|בעקבות)\s.*$|\s(?:после|вслед\s+за)\s.*$/iu,
    '',
  );

export function newsTier(item) {
  const a = analyze(item);
  const text = a.title + ' ' + a.summary;
  if (a.type !== 'news') return { tier: 'normal', reason: 'non_news_' + a.type };
  const notEvent = NOT_EVENT_TITLE.test(a.title);
  for (const [reason, re] of URGENT_SIGNALS) {
    if (TITLE_ONLY_SIGNALS.has(reason) ? !notEvent && re.test(a.title) : re.test(text))
      return { tier: 'urgent', reason };
  }
  if (
    a.topic === 'strike' &&
    a.score >= CORE_STRIKE_SCORE &&
    KINETIC_TITLE.test(MAIN_CLAUSE(a.title)) &&
    !notEvent
  )
    return { tier: 'urgent', reason: 'strike_core_region' };
  if (['strike', 'military'].includes(a.topic) && a.score >= 6)
    return { tier: 'important', reason: 'military_' + a.topic };
  if (['negotiation', 'diplomacy', 'sanctions'].includes(a.topic) && a.score >= 6)
    return { tier: 'important', reason: 'decision_' + a.topic };
  if (a.score >= 7) return { tier: 'important', reason: 'high_score' };
  return { tier: 'normal', reason: 'default' };
}

// Stable queue order: tier first, then the given secondary order.
export const byTier = (a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier];
