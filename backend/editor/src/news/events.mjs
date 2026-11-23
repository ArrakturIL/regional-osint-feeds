import { relatedSeniorTarget, distinctNamedTargets, reportingClaim } from './claim-identity.mjs';
// REGIONAL WATCH production event engine. No AI can certify a factual claim.
export const FEEDS = [
  ['BBC Middle East', 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', 'bbc', 'en', 4],
  ['Times of Israel', 'https://www.timesofisrael.com/feed/', 'toi', 'en', 4],
  ['Jerusalem Post / Israel', 'https://www.jpost.com/rss/rssfeedsisraelnews.aspx', 'jpost', 'en', 4],
  ['Jerusalem Post / Iran', 'https://www.jpost.com/rss/rssfeedsiran', 'jpost', 'en', 4],
  ['Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml', 'aljazeera', 'en', 3],
  ['Israel Hayom', 'https://www.israelhayom.co.il/rss.xml', 'israelhayom', 'he', 4],
  ['Maariv', 'https://www.maariv.co.il/Rss/RssChadashot', 'maariv', 'he', 4],
  ['Arutz Sheva', 'https://www.israelnationalnews.com/Rss.aspx?act=.1', 'arutzsheva', 'en', 3],
  ['JNS', 'https://www.jns.org/feed/', 'jns', 'en', 3],
  ['Al-Monitor', 'https://www.al-monitor.com/rss', 'almonitor', 'en', 4],
  ['France 24', 'https://www.france24.com/en/middle-east/rss', 'france24', 'en', 4],
  ['The Guardian', 'https://www.theguardian.com/world/israel/rss', 'guardian', 'en', 3],
];
const META = new Map(FEEDS.map(f => [f[0], { owner: f[2], language: f[3] }]));
export const publisher = name => META.get(name)?.owner || String(name || 'unknown');
export const language = name => META.get(name)?.language || 'en';
export const hebrew = s => /[\u0590-\u05ff]/u.test(String(s || ''));
const R = [
  ['israel', /\bisrael(?:i|is)?\b|ישראל|إسرائيل|израил/iu],
  ['iran', /\biran(?:ian)?\b|איראן|إيران|иран/iu],
  ['gaza', /\bgaza\b|עזה|غزة|газ[аеуы]/iu],
  ['lebanon', /\blebanon\b|לבנון|لبنان|ливан/iu],
  ['syria', /\bsyria\b|סוריה|سوريا|сири/iu],
  ['yemen', /\byemen\b|תימן|اليمن|йемен/iu],
  ['oman', /\boman(?:i)?\b|עומאן|عمان|оман[\p{L}]*/iu],
  ['iraq', /\biraq(?:i)?\b|עיראק|العراق|ирак[\p{L}]*/iu],
  ['jordan', /\bjordan(?:ian)?\b|ירד(?:ן|נ[\p{L}]*)|الأردن|иордан[\p{L}]*/iu],
  ['saudi', /\bsaudi\b|السعودية|סעודיה|саудов[\p{L}]*/iu],
  ['uae', /\b(?:UAE|Emirates)\b|האמירויות|الإمارات|оаэ|эмират[\p{L}]*/iu],
  ['qatar', /\bqatar(?:i)?\b|קטאר|قطر|катар[\p{L}]*/iu],
  ['bahrain', /\bbahrain\b|בחריין|البحرين|бахрейн[\p{L}]*/iu],
  ['kuwait', /\bkuwait\b|כווית|الكويت|кувейт[\p{L}]*/iu],
  ['idf', /\bIDF\b|צה[״"']?ל|цахал/iu],
  ['hamas', /\bhamas\b|חמאס|حماس|хамас/iu],
  ['hezbollah', /\bhezbollah\b|חיזבאללה|حزب الله|хезбол/iu],
  ['us', /\b(?:US|USA|American)\b|ארה[״"']?ב|الولايات المتحدة|сша/iu],
  ['netanyahu', /\bnetanyahu\b|נתניהו|نتنياهو|нетаньяху/iu],
];
const D = [
  ['nasser', /\bnasser(?: hospital)?\b|בית החולים נאסר|مستشفى ناصر|нассер/iu],
  ['shifa', /\b(?:al.?shifa|shifa)(?: hospital)?\b|בית החולים שיפא|مستشفى الشفاء|шифа/iu],
  ['fairford', /\bfairford\b|פיירפורד|فيرفورد|фэрфорд/iu],
  ['didamar', /\bdidamar\b|דידמר|ديدمار|дидамар/iu],
  ['khan_younis', /\bkhan (?:younis|yunis)\b|חאן יונס|خان يونس|хан.?юн/iu],
  ['katz', /\bkatz\b|כץ|кац/iu],
  ['ghalibaf', /\bghalibaf\b|קאליבאף|قاليباف|галибаф/iu],
  ['vance', /\bvance\b|ואנס|فانس|вэнс/iu],
  ['netanyahu', /\bnetanyahu\b|נתניהו|نتنياهو|нетаньяху/iu],
];
const T = [
  [
    'strike',
    /\b(?:strikes?|attacks?|airstrikes?|bombing|shelling|raid|explosion)\b|תקיפ|הפצצ|פגיע|قصف|هجوم|غارة|удар|атак|обстрел/iu,
  ],
  [
    'negotiation',
    /\b(?:talks?|negotiat(?:ions?|ing)|ceasefire|truce|deal|MOU)\b|משא ומתן|שיחות|הפסקת אש|مفاوضات|محادثات|هدنة|переговор|перемири/iu,
  ],
  [
    'military',
    /\b(?:missiles?|ballistic|rockets?|interception|drones?|fighter jets?|deployment|air defense)\b|טילים|יירוט|כטב.?ם|صواريخ|ракет|беспилотник|воен/iu,
  ],
  [
    'diplomacy',
    /\b(?:Security Council|UNSC|summit|ambassador|embassy|diplomatic|resolution|foreign minister)\b|מועצת הביטחון|שגריר|פסגה|مجلس الأمن|قمة|دبلوماسية|совет безопасности|дипломат|посол/iu,
  ],
  [
    'election',
    /\b(?:election|coalition|caretaker government|knesset)\b|בחירות|קואליצי|ממשלת מעבר|انتخابات|выбор|коалици/iu,
  ],
  [
    'governance',
    /\b(?:budget|funding|taxpayer|court|protest|indictment|corruption|government spending)\b|בג.?ץ|תקציב|מימון|מחאה|שחיתות|ميزانية|فساد|бюджет|финансирован|коррупци|суд/iu,
  ],
  ['sanctions', /\b(?:sanctions?|embargo|blacklist)\b|סנקציות|عقوبات|санкци/iu],
  [
    'statement',
    /\b(?:says?|warns?|claims?|statement|pledges?|announces?)\b|הזהיר|הודיע|אומר|صرح|حذر|заявил|предупредил|объявил/iu,
  ],
];
const S = [
  ['nuclear', /\bnuclear\b|גרעין|نووي|ядер/iu],
  ['missile', /\b(?:missile|ballistic)\b|טיל|صاروخ|ракет/iu],
  ['ceasefire', /\b(?:ceasefire|truce)\b|הפסקת אש|هدنة|перемири/iu],
  ['deal', /\b(?:deal|agreement|MOU)\b|הסכם|اتفاق|соглашени/iu],
];
const W = {
  roundup: 24,
  strike: 8,
  military: 24,
  negotiation: 36,
  diplomacy: 36,
  election: 48,
  governance: 30,
  sanctions: 48,
  statement: 24,
  other: 18,
};
const BASE = {
  strike: 6,
  military: 5,
  negotiation: 4,
  diplomacy: 4,
  sanctions: 4,
  election: 3,
  governance: 3,
  statement: 2,
  other: 0,
};
const VENUES = new Set(['nasser', 'shifa', 'fairford', 'didamar']);
const PEOPLE = new Set(['katz', 'ghalibaf', 'vance', 'netanyahu']);
const match = (s, arr) => new Set(arr.filter(x => x[1].test(s)).map(x => x[0]));
const overlap = (a, b) => [...a].filter(x => b.has(x));
const tokens = s =>
  new Set(
    (
      String(s || '')
        .normalize('NFKC')
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) || []
    ).filter(
      x =>
        x.length > 2 &&
        ![
          'the',
          'and',
          'for',
          'from',
          'that',
          'with',
          'this',
          'new',
          'says',
          'said',
          'after',
          'before',
        ].includes(x),
    ),
  );
const hasClaim = s =>
  /\b(?:reported|reportedly|alleged|claims|according to|unverified)\b|לפי|לדברי|بحسب|زعم|сообща|предполож/iu.test(
    s,
  );
// A regulatory restriction on a service is not a new military attack merely
// because the summary cites a prior security incident as background.
const CIVIC_RESTRICTION =
  /\b(?:bans?|banned|blocks?|blocked|restricts?|restricted|prohibits?|prohibited)\b.{0,100}\b(?:national\s+security|security\s+concerns|messaging|platform|applications?|social\s+media|telecom(?:munications)?)\b/iu;
function restrictedSubject(headline) {
  if (!CIVIC_RESTRICTION.test(String(headline || ''))) return null;
  const m = String(headline).match(
    /\b(?:bans?|banned|blocks?|blocked|restricts?|restricted|prohibits?|prohibited)\s+(?:the\s+)?([\p{L}][\p{L}\p{N}-]*)/iu,
  );
  const subject = m?.[1]?.normalize('NFKC').toLowerCase();
  return subject &&
    !new Set(['messaging', 'app', 'application', 'platform', 'social', 'internet', 'online']).has(subject)
    ? subject
    : null;
}
const JUDICIAL_SENTENCE = /\b(?:sentenc(?:e(?:s|d)?|ing)|convict(?:s|ed|ion))\b/iu;
function judicialVerdict(headline) {
  const title = String(headline || '');
  if (!JUDICIAL_SENTENCE.test(title)) return null;
  const digit = title
    .match(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/iu)?.[0]
    ?.toLowerCase();
  const names = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const count = digit ? names[digit] || Number(digit) : null;
  return { count, deathSentence: /\bdeath\b/iu.test(title) };
}
const COMMON_JUDICIAL_TOKENS = new Set([
  'court',
  'courts',
  'sentenced',
  'sentence',
  'sentences',
  'death',
  'men',
  'people',
  'three',
  'two',
  'one',
  'four',
  'five',
  'after',
  'over',
  'attack',
  'deadly',
  'fatal',
  'killed',
]);
const OPINION_URL = /(?:^|\/)(?:opinion|commentary|columns?)(?:\/|[?#]|$)/iu;
const OPINION_SIGNOFF = /(?:^|\.\s*)opinion\.\s*$/iu;
function explicitPoliticalActor(headline) {
  // Only explicit speaker-first headlines are comparable; do not invent an
  // identity from a background name shared by unrelated announcements.
  const m = String(headline || '')
    .trim()
    .match(
      /^([\p{Lu}][\p{L}-]{2,})(?:['’]s\s+party)?\s+(?:rules?\s+out|warns?|rejects?|opposes?|backs?|endorses?|calls?|says?|states?|declares?)\b/u,
    );
  return m ? m[1].normalize('NFKC').toLowerCase() : null;
}

// Podcast episodes whose headline does not say so (live 22.11, ToI: «Still Life
// in Israel: …» — "In the fourth episode of our new podcast series, the writer
// talks about her new book") and book/film reviews: not news, so never above
// normal. A news summary that only mentions what someone said on a podcast
// does not match: it needs an episode or "our podcast".
const PODCAST_SUMMARY =
  /\bepisode\b.{0,60}\bpodcast\b|\bpodcast\b.{0,40}\bepisode\b|\bour\s+(?:\p{L}+\s+){0,3}podcast\b|(?:בפרק|פרק)\s.{0,40}פודקאסט|выпуск\p{L}*\s.{0,40}подкаст/iu;
const REVIEW_TITLE =
  /\b(?:book|film|movie|theater|theatre|album|TV)\s+review\b|^review:|ביקורת\s+(?:ספר|סרט|תיאטרון)|рецензи/iu;

export function analyze(a) {
  const title = String(a.headline || a.title || ''),
    summary = String(a.summary || '');
  const all = title + ' ' + summary,
    region = match(all, R),
    detail = match(all, D),
    sub = match(all, S);
  let topic =
    CIVIC_RESTRICTION.test(title) || JUDICIAL_SENTENCE.test(title)
      ? 'governance'
      : T.find(x => x[1].test(title))?.[0] || T.find(x => x[1].test(all))?.[0] || 'other';
  const type =
    /(?:\b(?:opinion|commentary|column)\b|טור דעה|דעה|رأي)/iu.test(title) ||
    OPINION_URL.test(String(a.url || '')) ||
    OPINION_SIGNOFF.test(summary)
      ? 'opinion'
      : /\b(?:live blog|live updates|as it happened)\b|עדכונים שוטפים|مباشر/iu.test(title)
        ? 'liveblog'
        : /\b(?:archive|archival|historical footage|from (?:19|20)\d{2})\b|ארכיון|أرشيف|архивн/iu.test(title)
          ? 'archive'
          : /\b(?:daily\s+briefing|weekly\s+briefing|podcast|roundup|recap)\b|פודקאסט|подкаст/iu.test(title) ||
              PODCAST_SUMMARY.test(summary) ||
              REVIEW_TITLE.test(title)
            ? 'roundup'
            : /\b(?:sponsored|advertorial)\b|תוכן ממומן|إعلان/iu.test(title)
              ? 'sponsored'
              : 'news';
  if (type === 'roundup') topic = 'roundup';
  let score =
    (type === 'roundup' ? 4 : BASE[topic]) +
    (overlap(region, new Set(['israel', 'iran', 'idf', 'hamas', 'hezbollah', 'netanyahu'])).length
      ? 2
      : region.size
        ? 1
        : 0);
  if (overlap(detail, VENUES).length) score++;
  if (type === 'opinion') score -= 3;
  if (type === 'sponsored' || type === 'liveblog' || type === 'archive') score = 0;
  score = Math.max(0, Math.min(10, score));
  // A purely domestic U.S. issue is not automatically Middle East news.
  const usOnly =
    region.size === 1 &&
    region.has('us') &&
    !detail.size &&
    !/\b(?:middle east|persian gulf|strait of hormuz)\b/iu.test(all);
  const policy =
    (!region.size && !detail.size) || usOnly
      ? 'hold_irrelevant'
      : type !== 'news'
        ? 'hold_nonnews'
        : score < 3
          ? 'hold_low_signal'
          : score < 4
            ? 'review'
            : 'candidate';
  return {
    ...a,
    ...reportingClaim({ source: a.source, headline: title, summary }),
    title,
    summary,
    topic,
    type,
    score,
    policy,
    region,
    detail,
    sub,
    words: tokens(title),
    time: Number(a.published_ms || 0),
    owner: publisher(a.source),
    lang: language(a.source),
    claimed: hasClaim(all),
  };
}

const SEQUEL =
  /(?:\b(?:second|another|renewed|separate)\s+(?:israeli\s+)?(?:air)?strike\b|\b(?:struck|hit|bombed)\s+again\b|תקיפה\s+נוספת|втор[а-яё]*\s+удар|повторн[а-яё]*\s+удар)/iu;
function signals(a) {
  const s = (a.title || '') + ' ' + (a.summary || ''),
    t = new Set();
  if (/\bsurgeon\b|хирург|מנתח/iu.test(s)) t.add('surgeon');
  if (/\b(?:brigade\s+commander|hamas\s+commander|commander\s+of\s+hamas)\b|командир\s+бригад/iu.test(s))
    t.add('commander');
  if (/\bcivil\s+defen[cs]e\b|гражданск[а-яё]+\s+оборон/iu.test(s)) t.add('civil');
  if (/\bsurgery\s+(?:department|ward)\b/iu.test(s)) t.add('surgery');
  if (/\b(?:6|six)\b/iu.test(s) && /\b(?:kill(?:s|ed|ing)?|dead|wounded|casualties|people)\b/iu.test(s))
    t.add('six');
  if (
    /\b(?:5|five)\b/iu.test(s) &&
    /\b(?:kill(?:s|ed|ing)?|dead|wounded|casualties|palestinians)\b/iu.test(s)
  )
    t.add('five');
  return {
    tags: t,
    sequel: SEQUEL.test(s),
    hospital: /\bhospital\b|בית\s+חולים|مستشفى|больниц|госпитал/iu.test(s),
  };
}
function incompatible(a, b) {
  const va = overlap(a.detail, VENUES),
    vb = overlap(b.detail, VENUES);
  return (
    Boolean(va.length && vb.length && !va.some(x => vb.includes(x))) ||
    signals(a).sequel !== signals(b).sequel ||
    distinctNamedTargets(a, b)
  );
}
function namedFatality(a) {
  // Match the grammatical subject of a death report, not any name mentioned
  // as background. A full name and matching role keep generic attacks separate.
  const text = String(a.summary || '');
  const name = text.match(
    /\b([A-Z][\p{L}'’\-]+(?:\s+[A-Z][\p{L}'’\-]+){1,3})(?:,\s*[^.!?]{1,110},)?\s+(?:was|has been)\s+(?:killed|slain)\b/u,
  )?.[1];
  const role = ((a.title || '') + ' ' + text).match(/\b(goalkeeper|surgeon|journalist|paramedic)\b/iu)?.[1];
  return name && role ? name.normalize('NFKC').toLowerCase() + '|' + role.toLowerCase() : null;
}
// 21.11: one strike told three ways (Al Jazeera «hits food aid vehicle… killing
// three», ToI «in Gaza City kills 3… aid workers», JPost «vehicle struck in
// Gaza… PIJ») did not merge: no shared venue token, low headline overlap.
// Same region, ≤ 6 h, the same struck object and the same death toll make it one
// event; with the toll known on one side only, three shared headline words do.
const NUM_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const NUM = '(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)';
const TOLL = [
  new RegExp('\\bkill(?:s|ed|ing)\\s+(?:at\\s+least\\s+)?' + NUM + '\\b', 'iu'),
  new RegExp('\\b' + NUM + '\\s+(?:[\\p{L}-]+\\s+){0,2}(?:were\\s+|are\\s+)?(?:killed|dead)\\b', 'iu'),
];
export function deathToll(a) {
  const text = (a.title || '') + ' ' + (a.summary || '');
  for (const re of TOLL) {
    const m = text.match(re)?.[1]?.toLowerCase();
    if (m) return NUM_WORDS[m] || Number(m);
  }
  return null;
}
const STRUCK_OBJECT =
  /\b(vehicles?|cars?|trucks?|convoys?|tents?|schools?|homes?|houses?|buildings?|apartments?|boats?|ships?|vessels?|ambulances?|mosques?|hospitals?)\b/giu;
const struckObjects = a =>
  new Set(
    [...((a.title || '') + ' ' + (a.summary || '')).matchAll(STRUCK_OBJECT)].map(m =>
      m[1].toLowerCase().replace(/s$/, ''),
    ),
  );
export function sameEvent(a, b) {
  if (a.id === b.id) return { ok: true, why: 'same_article' };
  if (a.topic !== b.topic) return { ok: false, why: 'different_action' };
  if (a.topic === 'election') {
    const pa = explicitPoliticalActor(a.title),
      pb = explicitPoliticalActor(b.title);
    if (pa && pb && pa !== pb) return { ok: false, why: 'different_political_actors' };
  }
  const hours = Math.abs(a.time - b.time) / 3600000;
  if (!a.time || !b.time || incompatible(a, b)) return { ok: false, why: 'incompatible' };
  const va = overlap(a.detail, VENUES),
    vb = overlap(b.detail, VENUES);
  const venue = va.length && vb.length && va.some(x => vb.includes(x));
  const region = overlap(a.region, b.region).length > 0;
  const common = overlap(a.words, b.words).length,
    union = new Set([...a.words, ...b.words]).size,
    ratio = union ? common / union : 0;
  if (a.topic === 'strike') {
    if (relatedSeniorTarget(a, b, hours) && region) return { ok: true, why: 'shared_senior_target' };
    if (hours > 24) return { ok: false, why: 'strike_window' };
    const victim = namedFatality(a);
    if (region && victim && victim === namedFatality(b)) return { ok: true, why: 'same_named_fatality' };
    const x = signals(a),
      y = signals(b),
      shared = [...x.tags].filter(v => y.tags.has(v));
    if (venue && region) {
      if (hours <= 2) return { ok: true, why: 'venue_close_time' };
      if (hours <= 7 && shared.length > 0) return { ok: true, why: 'venue_evidence' };
      if (
        hours <= 24 &&
        (shared.includes('surgeon') ||
          shared.includes('commander') ||
          (hours <= 12 && shared.includes('six')))
      )
        return { ok: true, why: 'late_followup' };
    }
    if (
      (!va.length || !vb.length) &&
      region &&
      x.hospital &&
      y.hospital &&
      hours <= 18 &&
      shared.includes('surgeon') &&
      shared.includes('six')
    )
      return { ok: true, why: 'victim_casualties' };
    if (!venue && hours <= 5 && region && common >= 4 && ratio >= 0.6)
      return { ok: true, why: 'high_overlap' };
    if (region && hours <= 6) {
      const oa = struckObjects(a),
        sharedObject = [...struckObjects(b)].some(o => oa.has(o));
      const ta = deathToll(a),
        tb = deathToll(b);
      if (sharedObject && ta && tb && ta !== tb) return { ok: false, why: 'different_death_toll' };
      if (sharedObject && ((ta && ta === tb) || ((!ta || !tb) && common >= 3)))
        return { ok: true, why: 'same_struck_object' };
    }
    return { ok: false, why: 'uncorroborated' };
  }
  if (a.topic === 'negotiation') {
    const textA = (a.title || '') + ' ' + (a.summary || ''),
      textB = (b.title || '') + ' ' + (b.summary || '');
    const directDeal =
      /(?:\b(?:we|us|u\.s\.)\s+(?:don['’]?t|does(?:\s+not|n['’]?t))\s+need\s+(?:(?:a|an)\s+)?(?:iran\s+)?deal\b)/iu;
    const pair = text => /\btrump\b/iu.test(text) && /\bvance\b/iu.test(text);
    if (pair(textA) && pair(textB)) {
      const qa = directDeal.test(textA),
        qb = directDeal.test(textB);
      if (qa !== qb) return { ok: false, why: 'different_negotiation_claim' };
      if (qa && qb)
        return hours <= 16
          ? { ok: true, why: 'same_direct_public_statement' }
          : { ok: false, why: 'different_statement_day' };
    }
  }
  if (hours > W[a.topic]) return { ok: false, why: 'different_time' };
  if (a.topic === 'governance' && region) {
    const ja = judicialVerdict(a.title),
      jb = judicialVerdict(b.title);
    if (ja && jb) {
      if (ja.count && jb.count && ja.count !== jb.count)
        return { ok: false, why: 'different_sentencing_counts' };
      if (ja.count && ja.count === jb.count && ja.deathSentence === jb.deathSentence && hours <= 24) {
        const generic = new Set([...COMMON_JUDICIAL_TOKENS, ...a.region, ...b.region]);
        const distinctive = overlap(a.words, b.words).filter(x => !generic.has(x));
        if (distinctive.length >= 1 && common >= 4) return { ok: true, why: 'same_judicial_verdict' };
      }
    }
    const aa = restrictedSubject(a.title),
      bb = restrictedSubject(b.title);
    if (aa && bb && aa !== bb) return { ok: false, why: 'different_regulated_subject' };
    if (aa && aa === bb && common >= 3) return { ok: true, why: 'same_regulatory_subject' };
  }
  if (venue && region) return { ok: true, why: 'same_venue_action_time' };
  if (
    overlap(a.detail, b.detail).some(v => PEOPLE.has(v)) &&
    region &&
    (ratio >= 0.26 || (hours <= 6 && overlap(a.sub, b.sub).length))
  )
    return { ok: true, why: 'same_person_context' };
  if (region && common >= 4 && ratio >= 0.7) return { ok: true, why: 'high_headline_overlap' };
  return { ok: false, why: 'insufficient_identity' };
}
export function group(rows) {
  const held = [],
    eligible = [];
  for (const row of rows) {
    const x = analyze(row);
    (x.policy === 'candidate' ? eligible : held).push(x);
  }
  eligible.sort((a, b) => a.time - b.time || String(a.id).localeCompare(String(b.id)));
  const groups = [];
  for (const a of eligible) {
    const matches = groups.filter(g =>
      a.topic === 'strike'
        ? g.members.some(b => sameEvent(a, b).ok) && !g.members.some(b => incompatible(a, b))
        : g.members.every(b => sameEvent(a, b).ok),
    );
    if (!matches.length) {
      groups.push({ members: [a], reasons: ['new_event'] });
      continue;
    }
    if (matches.length === 1) {
      const g = matches[0],
        link = g.members.find(b => sameEvent(a, b).ok);
      g.members.push(a);
      g.reasons.push(sameEvent(a, link).why);
      continue;
    }
    const joined = matches.flatMap(g => g.members);
    let safe = true;
    for (let k = 0; k < joined.length && safe; k++)
      for (let m = k + 1; m < joined.length; m++)
        if (incompatible(joined[k], joined[m])) {
          safe = false;
          break;
        }
    if (!safe) {
      groups.push({ members: [a], reasons: ['ambiguous_bridge'] });
      continue;
    }
    const primary = matches[0];
    primary.members.push(...joined.filter(x => !primary.members.includes(x)), a);
    primary.reasons.push('corroborated_bridge_merge');
    for (const g of matches.slice(1)) {
      const k = groups.indexOf(g);
      if (k >= 0) groups.splice(k, 1);
    }
  }
  return { groups, held };
}

async function hash(s) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return Array.from(bytes)
    .slice(0, 10)
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}
function origin(a) {
  if (/\breuters\b|רויטרס|رويترز|рейтерс/iu.test(a.summary)) return 'reuters';
  if (/\b(?:associated press|AP reports)\b|أسوشيتد برس/iu.test(a.summary)) return 'ap';
  return a.owner;
}

// Pick the representative that can actually be displayed in RU and HE.
// Never let an untranslated late follow-up hide already localized reporting.
function representativeQuality(a) {
  let quality = 0;
  if (typeof a.headline_ru === 'string' && a.headline_ru.trim()) quality += 12;
  if (a.he_cached) quality += 12;
  if (a.lang === 'he') quality += 10;
  if (a.topic === 'strike') {
    if (T[0][1].test(a.title || '')) quality += 4;
    if (D.some(([name, rule]) => VENUES.has(name) && rule.test(a.title || ''))) quality += 6;
    if (/\b(?:killed|dead|deaths?|fatalities|wounded|surgeon)\b|убит|погиб|נהרג/iu.test(a.title || ''))
      quality += 2;
  }
  return quality;
}

export async function reconcile(db, now = Date.now()) {
  const rows =
    (
      await db
        .prepare(
          "SELECT n.id,n.source,n.headline,n.headline_ru,n.summary,n.url,n.published_ms,n.discovered_ms,n.priority,CASE WHEN t.title IS NOT NULL AND t.quality_score>=85 THEN 1 ELSE 0 END he_cached FROM news_items n LEFT JOIN regional_i18n t ON t.kind='news' AND t.item_id=n.id AND t.language='he' WHERE n.published_ms>=? ORDER BY n.published_ms DESC LIMIT 380",
        )
        .bind(now - 7 * 86400000)
        .all()
    ).results || [];
  const { groups, held } = group(rows);
  const previous =
    (await db.prepare('SELECT article_id,event_id FROM news_event_members').all()).results || [];
  const prior = new Map(previous.map(r => [r.article_id, r.event_id]));
  // D1 budget: the upserts below only change a row when these fields differ (see
  // their WHERE clauses), so unchanged rows are skipped here instead of being sent.
  const storedGroups = new Map(
    (
      (
        await db
          .prepare('SELECT event_id,representative_id,priority,signature,sources_json FROM news_event_groups')
          .all()
      ).results || []
    ).map(r => [r.event_id, r]),
  );
  // A split can produce two groups pointing to the same old ID. Allocate
  // previous IDs *globally* by greatest overlap before any UPSERT; each old ID
  // can be inherited by at most one group. New IDs avoid historical ID reuse.
  const edges = [];
  for (const [index, g] of groups.entries()) {
    const counts = new Map();
    for (const member of g.members) {
      const id = prior.get(member.id);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    for (const [id, count] of counts) edges.push({ index, id, count, size: g.members.length });
  }
  edges.sort((a, b) => b.count - a.count || b.size - a.size || a.index - b.index || a.id.localeCompare(b.id));
  const assigned = new Map(),
    taken = new Set();
  for (const edge of edges) {
    if (assigned.has(edge.index) || taken.has(edge.id)) continue;
    assigned.set(edge.index, edge.id);
    taken.add(edge.id);
  }
  const reserved = new Set(previous.map(x => x.event_id)),
    used = new Set(taken);
  const batch = [];
  for (const [index, g] of groups.entries()) {
    const members = g.members;
    let eventId = assigned.get(index);
    if (!eventId) {
      let n = 0;
      do {
        eventId = 'evt_' + (await hash(members[0].id + (n ? '|split:' + n : '')));
        n++;
      } while (reserved.has(eventId) || used.has(eventId));
    }
    used.add(eventId);
    const best = [...members].sort(
      (a, b) => b.score - a.score || representativeQuality(b) - representativeQuality(a) || b.time - a.time,
    )[0];
    const ownerCount = new Set(members.map(x => x.owner)).size;
    const originCount = new Set(members.map(origin)).size;
    const sources = members.map(x => ({
      article_id: x.id,
      source: x.source,
      publisher: x.owner,
      language: x.lang,
      url: x.url,
      published_ms: x.time,
      collected_ms: Number.isSafeInteger(x.discovered_ms) && x.discovered_ms > 0 ? x.discovered_ms : null,
      original_headline: x.title,
      source_assertion: x.claim_about_death,
      claimed_by: x.claimed_by,
    }));
    const signature = members
      .map(x => x.id)
      .sort()
      .join('|');
    const priority = Math.max(...members.map(m => m.score)),
      sourcesJson = JSON.stringify(sources),
      stored = storedGroups.get(eventId);
    const groupUnchanged =
      stored &&
      stored.signature === signature &&
      stored.priority === priority &&
      stored.representative_id === best.id &&
      stored.sources_json === sourcesJson;
    if (!groupUnchanged)
      batch.push(
        db
          .prepare(
            'INSERT INTO news_event_groups(event_id,representative_id,topic,priority,last_seen_ms,member_count,source_count,origin_count,verification_status,reason_codes,sources_json,signature,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET representative_id=excluded.representative_id,topic=excluded.topic,priority=excluded.priority,last_seen_ms=excluded.last_seen_ms,member_count=excluded.member_count,source_count=excluded.source_count,origin_count=excluded.origin_count,verification_status=excluded.verification_status,reason_codes=excluded.reason_codes,sources_json=excluded.sources_json,signature=excluded.signature,updated_ms=excluded.updated_ms WHERE news_event_groups.signature!=excluded.signature OR news_event_groups.priority!=excluded.priority OR news_event_groups.representative_id!=excluded.representative_id OR news_event_groups.sources_json!=excluded.sources_json',
          )
          .bind(
            eventId,
            best.id,
            best.topic,
            priority,
            Math.max(...members.map(m => m.time)),
            members.length,
            ownerCount,
            originCount,
            originCount > 1 ? 'multi_outlet_reporting' : 'single_origin_reporting',
            JSON.stringify([...new Set(g.reasons)]),
            sourcesJson,
            signature,
            now,
          ),
      );
    for (const m of members)
      if (prior.get(m.id) !== eventId)
        batch.push(
          db
            .prepare(
              'INSERT INTO news_event_members(article_id,event_id,updated_ms) VALUES(?,?,?) ON CONFLICT(article_id) DO UPDATE SET event_id=excluded.event_id,updated_ms=excluded.updated_ms WHERE news_event_members.event_id!=excluded.event_id',
            )
            .bind(m.id, eventId, now),
        );
  }
  for (let i = 0; i < batch.length; i += 80) await db.batch(batch.slice(i, i + 80));
  // Delete obsolete event heads after a former cluster has been re-assigned.
  // Never remove historical news_items; only stale materialized event summaries.
  // Retire stale memberships when candidates become held or leave the active window.
  // This never deletes original news_items, only the derived event index.
  const activeIds = new Set(groups.flatMap(g => g.members.map(m => m.id)));
  const staleIds = previous.map(m => m.article_id).filter(id => !activeIds.has(id));
  // Cloudflare D1 has a bound-parameter limit; delete only retired IDs in chunks.
  for (let i = 0; i < staleIds.length; i += 120) {
    const part = staleIds.slice(i, i + 120);
    await db
      .prepare('DELETE FROM news_event_members WHERE article_id IN (' + part.map(() => '?').join(',') + ')')
      .bind(...part)
      .run();
  }
  // Orphan heads can only appear after a write or a retired member; an hourly pass
  // (first 5 minutes of each UTC hour) also cleans up after any interrupted run.
  if (batch.length || staleIds.length || now % 3600000 < 300000)
    await db
      .prepare(
        'DELETE FROM news_event_groups WHERE NOT EXISTS (SELECT 1 FROM news_event_members m WHERE m.article_id=news_event_groups.representative_id AND m.event_id=news_event_groups.event_id)',
      )
      .run();
  const state = {
    time: new Date(now).toISOString(),
    input: rows.length,
    events: groups.length,
    held: held.length,
    duplicated: groups.reduce((n, g) => n + g.members.length - 1, 0),
    publishers: new Set(rows.map(r => publisher(r.source))).size,
  };
  await db
    .prepare(
      "INSERT INTO editor_state(key,value,updated_ms) VALUES('last_event_filter',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms",
    )
    .bind(JSON.stringify(state), now)
    .run();
  return state;
}
// F-06: /api/news orders and filters the whole 7-day pool but shows one page.
// The pool needs only these light columns; text fields (~0.5 MB for ~360 events)
// are read for the page rows alone via eventRowsByIds.
const EVENT_FROM =
  " FROM news_event_groups e JOIN news_items n ON n.id=e.representative_id LEFT JOIN regional_i18n t ON t.kind='news' AND t.item_id=n.id AND t.language='he'";
const EVENT_FULL =
  'SELECT e.event_id,e.topic,e.priority event_priority,e.member_count,e.source_count,e.origin_count,e.verification_status,e.reason_codes,e.sources_json,e.last_seen_ms,n.id,n.source,n.headline,n.headline_ru,n.summary,n.summary_ru,n.comment,n.url,n.published_ms,n.priority,t.source_hash he_hash,t.title he_title,t.body he_body,t.commentary he_comment,t.quality_score he_quality' +
  EVENT_FROM;
export async function eventIndex(db, withSources = false) {
  const sql =
    'SELECT e.event_id,e.topic,e.priority event_priority,e.verification_status,e.last_seen_ms,n.source' +
    (withSources ? ',e.sources_json' : '') +
    ' FROM news_event_groups e JOIN news_items n ON n.id=e.representative_id WHERE e.last_seen_ms>=? ORDER BY e.priority DESC,e.last_seen_ms DESC,e.event_id ASC';
  return (
    (
      await db
        .prepare(sql)
        .bind(Date.now() - 7 * 86400000)
        .all()
    ).results || []
  );
}
export async function eventRowsByIds(db, ids) {
  if (!ids.length) return [];
  const sql = EVENT_FULL + ' WHERE e.event_id IN (' + ids.map(() => '?').join(',') + ')';
  const byId = new Map(
    (
      (
        await db
          .prepare(sql)
          .bind(...ids)
          .all()
      ).results || []
    ).map(r => [r.event_id, r]),
  );
  return ids.map(id => byId.get(id)).filter(Boolean);
}
export async function eventRows(db, limit = 180) {
  const sql =
    "SELECT e.event_id,e.topic,e.priority event_priority,e.member_count,e.source_count,e.origin_count,e.verification_status,e.reason_codes,e.sources_json,e.last_seen_ms,n.id,n.source,n.headline,n.headline_ru,n.summary,n.summary_ru,n.comment,n.url,n.published_ms,n.priority,t.source_hash he_hash,t.title he_title,t.body he_body,t.commentary he_comment,t.quality_score he_quality FROM news_event_groups e JOIN news_items n ON n.id=e.representative_id LEFT JOIN regional_i18n t ON t.kind='news' AND t.item_id=n.id AND t.language='he' WHERE e.last_seen_ms>=? ORDER BY e.priority DESC,e.last_seen_ms DESC,e.event_id ASC LIMIT ?";
  const since = Date.now() - 7 * 86400000;
  const query =
    limit === null ? db.prepare(sql.replace(' LIMIT ?', '')).bind(since) : db.prepare(sql).bind(since, limit);
  return (await query.all()).results || [];
}
