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
  /\b(?:strikes?|struck|airstrikes?|shelling|shelled|bomb(?:ed|ing|ings)|(?:missile|drone|rocket)\s+(?:attacks?|fire|barrage)|intercept(?:ed|s|ion)|killed|kills|explosions?|blasts?|ramming|stabbing|shooting|terror(?:ist)?\s+attack|attacks?)\b|תקיפ|פיגוע|הפצצ|יירוט|נהרג|חוסל|פיצוץ|ירי\s+רקטות|удар|обстрел|теракт|перехват|погиб|взрыв|قصف|غارة|هجوم/iu;
const NOT_EVENT_TITLE =
  /\b(?:analysis|opinion|plots?|plotting|planning|plans?|threat|threatens?|could|may|might|scenario|explainer|how|why|what|fears?|frets?|warns?|crisis|ability|risks?)\b|ניתוח|תרחיש|מאיימ|מתכננ|анализ|угроз|может|план/iu;

export function newsTier(item) {
  const a = analyze(item);
  const text = a.title + ' ' + a.summary;
  if (a.type !== 'news') return { tier: 'normal', reason: 'non_news_' + a.type };
  for (const [reason, re] of URGENT_SIGNALS) if (re.test(text)) return { tier: 'urgent', reason };
  if (
    a.topic === 'strike' &&
    a.score >= CORE_STRIKE_SCORE &&
    KINETIC_TITLE.test(a.title) &&
    !NOT_EVENT_TITLE.test(a.title)
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
