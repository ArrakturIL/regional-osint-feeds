// Fail closed on editorial humour about death, injury, patients or humanitarian harm.
// Check both the original source and translations; a mistranslated title must not
// bypass policy. This is independent of the model prompt or its confidence.
const SENSITIVE_NEWS = [
  /\b(?:kill(?:s|ed|ing(?:s)?)?|dead|deaths?|died|dying|fatal(?:ity|ities)?|casualt(?:y|ies)|wounded|injur(?:ed|ies|y)|murder(?:ed)?|massacr(?:e|ed)|victims?|hostages?|slain|assassinat(?:ion|ed)|survivors?)\b/iu,
  /\b(?:hospitals?|patients?|surgeons?|doctors?|medics?|intensive\s+care|refugee\s+(?:camp|shelter)|humanitarian\s+(?:crisis|disaster))\b/iu,
  /(?:погиб[\p{L}]*|убит[\p{L}]*|убива[\p{L}]*|смерт[\p{L}]*|умер[\p{L}]*|скончал[\p{L}]*|ранен[\p{L}]*|жертв[\p{L}]*|заложник[\p{L}]*|пострадавш[\p{L}]*|больниц[\p{L}]*|госпитал[\p{L}]*|реанимаци[\p{L}]*|пациент[\p{L}]*|хирург[\p{L}]*|врач[\p{L}]*|медик[\p{L}]*|гуманитарн[\p{L}]*\s+(?:катастроф|трагед|кризис))/iu,
  /(?:נהרג[\p{L}]*|נרצח[\p{L}]*|הרוג[\p{L}]*|פצוע[\p{L}]*|נפגע[\p{L}]*|חטופ[\p{L}]*|קורבנ[\p{L}]*|בית\s+חולים|רופא[\p{L}]*|מטופל[\p{L}]*|אונס)/iu,
];
// Combat and military strikes require neutral reporting, even when casualties
// have not been established. Political "attacks" and labour strikes remain okay.
const ARMED_ACTION_EN =
  /\b(?:airstrikes?|military\s+strikes?|rocket\s+attacks?|drone\s+attacks?|missile\s+strikes?|bombings?|shelling|explosions?|detonations?)\b/iu;
const ARMED_TARGET_EN =
  /\b(?:irgc|idf|military|armed|navy|naval|air\s*base|airbase|raf|missiles?|rockets?|drones?|radar|tanker|warship|navigation\s+systems?|army|troops|combatants?|militants?|terrorists?|shelling|artillery)\b/iu;
const VIOLENT_ACTION_EN =
  /\b(?:attacks?|attacked|strike|strikes|struck|hit|raid|bombed|explosion|assault)\b/iu;
const ARMED_ACTION_RU =
  /(?:военн[\p{L}]*\s+удар[\p{L}]*|ракетн[\p{L}]*\s+атак[\p{L}]*|авиаудар[\p{L}]*|обстрел[\p{L}]*|бомбардиров[\p{L}]*)/iu;
const VIOLENT_ACTION_RU = /(?:удар[\p{L}]*|атак[\p{L}]*|взрыв[\p{L}]*|обстрел[\p{L}]*|подрыв[\p{L}]*)/iu;
const ARMED_TARGET_RU =
  /(?:военн[\p{L}]*|ракет[\p{L}]*|КСИР|ЦАХАЛ|арм[\p{L}]*|авиабаз[\p{L}]*|танкер[\p{L}]*|корабл[\p{L}]*|навигацион[\p{L}]*|ПВО|боевик[\p{L}]*|беспилотник[\p{L}]*)/iu;
const ARMED_ACTION_HE = /(?:תקיפ[\p{L}]*|הפצצ[\p{L}]*|ירי\s+טילים|פיצוצ[\p{L}]*|תקפה)/iu;
const ARMED_TARGET_HE =
  /(?:בסיס|צבא|חיל\s+האוויר|טיל[\p{L}]*|כטב|מכ["״]?ם|ספינ[\p{L}]*|משמרות\s+המהפכה|מחבל[\p{L}]*)/iu;
function isViolentMilitaryNews(text) {
  // Explosions require neutral treatment even before the actor or casualties
  // are known. Keep the same protection in RU/HE as the English explosion rule.
  const literalText = text.replace(
    /взрыв\s+(?:негодования|возмущения|критики|эмоций|смеха|аплодисментов)/giu,
    '',
  );
  const explosion =
    /(?:^|[^\p{L}])(?:взрыв(?:а|у|ы|ов|е|ом|ам|ами|ах)?|детонаци[\p{L}]*|[ובכלמש]?ה?(?:פיצוץ|פיצוצים|התפוצצות))(?=$|[^\p{L}])/iu.test(
      literalText,
    );
  return (
    explosion ||
    ARMED_ACTION_EN.test(text) ||
    (VIOLENT_ACTION_EN.test(text) && ARMED_TARGET_EN.test(text)) ||
    ARMED_ACTION_RU.test(text) ||
    (VIOLENT_ACTION_RU.test(text) && ARMED_TARGET_RU.test(text)) ||
    (ARMED_ACTION_HE.test(text) && ARMED_TARGET_HE.test(text))
  );
}
// Owner 23.11: the site is Israeli; an ironic line must never smear Israel or
// the IDF. Live miss 23.11: Al Jazeera «Israeli soldiers beat a Palestinian after
// raiding his home» → «И ещё один мирный визит израильской армии». Any story
// about Israeli security forces or settlers acting toward Palestinians (raids,
// arrests, beatings, demolitions, the West Bank, Gaza) gets no irony at all.
const ISRAELI_FORCES =
  /(?:\b(?:idf|israeli\s+(?:soldiers?|troops|forces|army|military|police|border\s+police|settlers?)|settlers?|shin\s+bet)\b|ЦАХАЛ|израильск\p{L}*\s+(?:солдат|военн|сил|арми|полиц|пограничн|поселенц)\p{L}*|поселенц\p{L}*|ШАБАК|צה["״']?ל|חייל[\p{L}]*|מתנחל[\p{L}]*|שוטר[\p{L}]*|מג["״']?ב)/iu;
const PALESTINIAN_CONTEXT =
  /(?:\b(?:palestinians?|west\s+bank|gaza|jenin|nablus|hebron|ramallah|tulkarm|qalqilya|jericho|bethlehem|raid(?:s|ed)?|detain(?:s|ed)?|arrest(?:s|ed)?|beat(?:s|en|ing)?|demolish(?:es|ed)?|demolitions?|abuse[sd]?)\b|палестин\p{L}*|Западн\p{L}*\s+берег\p{L}*|Газ[аеуыой]\b|Дженин\p{L}*|Наблус\p{L}*|Хеврон\p{L}*|Рамалл\p{L}*|рейд\p{L}*|задерж\p{L}*|арест\p{L}*|избил\p{L}*|избиени\p{L}*|снос\p{L}*|פלסטינ[\p{L}]*|יהודה\s+ושומרון|עזה|ג['׳]נין|שכם|חברון|רמאללה|מעצר|פשיטה|הריסת)/iu;
// The comment itself must not make Israel or the IDF the butt of the joke.
const COMMENT_ABOUT_ISRAEL =
  /(?:ЦАХАЛ|израильск\p{L}*\s+(?:арми|солдат|военн|сил|полиц)\p{L}*|\b(?:idf|israeli\s+(?:army|soldiers|troops|forces))\b|צה["״']?ל)/iu;
export function israelSecurityStory(text) {
  return ISRAELI_FORCES.test(text) && PALESTINIAN_CONTEXT.test(text);
}
export function commentTargetsIsrael(comment) {
  return typeof comment === 'string' && COMMENT_ABOUT_ISRAEL.test(comment);
}
export function shouldSuppressComment(row) {
  const text = ['headline', 'summary', 'headline_ru', 'summary_ru', 'title', 'excerpt']
    .map(k => row?.[k])
    .filter(v => typeof v === 'string' && v.trim())
    .join(' ');
  return (
    SENSITIVE_NEWS.some(rule => rule.test(text)) || isViolentMilitaryNews(text) || israelSecurityStory(text)
  );
}
export function safePublishedComment(row, comment) {
  return shouldSuppressComment(row) || commentTargetsIsrael(comment) ? null : (comment ?? null);
}
