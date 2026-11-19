import { ruPlural } from './ruPlural.js';

// F-05: dossier meta that used to read "1 Первоисточники · 0 Связанные публикации",
// a raw "2026-11-17/18" event date and a wrong original-language note for AR.
export function sourceCount(n, he) {
  n = Math.max(0, Math.trunc(Number(n) || 0));
  if (he) return n === 0 ? 'אין מקורות' : n === 1 ? 'מקור אחד' : n + ' מקורות';
  return n === 0
    ? 'нет первоисточников'
    : n + ' ' + ruPlural(n, ['первоисточник', 'первоисточника', 'первоисточников']);
}

export function relatedCount(n, he) {
  n = Math.max(0, Math.trunc(Number(n) || 0));
  if (!n) return '';
  if (he) return n === 1 ? 'פרסום קשור אחד' : n + ' פרסומים קשורים';
  return n + ' ' + ruPlural(n, ['связанная публикация', 'связанные публикации', 'связанных публикаций']);
}

export function eventDateLabel(value, he) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:\/(\d{2}))?$/.exec(String(value || '').trim());
  if (!m) return value ? String(value) : '';
  const fmt = new Intl.DateTimeFormat(he ? 'he-IL' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const day = d => new Date(Date.UTC(+m[1], +m[2] - 1, d));
  if (!m[4] || m[4] === m[3]) return fmt.format(day(+m[3]));
  return +m[3] + '–' + fmt.format(day(+m[4]));
}

const DOSSIER_LANG = {
  ru: { en: 'английском', he: 'иврите', ar: 'арабском', fr: 'французском', fa: 'персидском' },
  he: { en: 'באנגלית', ru: 'ברוסית', ar: 'בערבית', fr: 'בצרפתית', fa: 'בפרסית' },
};
export function originalLanguageNote(lang, he) {
  const name = DOSSIER_LANG[he ? 'he' : 'ru'][lang];
  if (he) return (name ? 'המקור ' + name : 'המקור בשפה אחרת') + ' · התרגום ממתין';
  return (name ? 'Оригинал на ' + name : 'Оригинал на другом языке') + ' · перевод ожидается';
}

// 19.11 (owner): say who says it, not what we did not check. The old badges
// counted links ("one source — no independent confirmation") and called an
// IDF statement about its own meeting unconfirmed. Kinds: 'official' (the
// actor's own channel), 'party_claim' (one side about another — the only
// warning), 'media'. The monitor may set source.kind/publisher; otherwise
// official channels are known by domain.
const OFFICIAL_SOURCES = [
  [/(^|\.)idf\.il$/, 'ЦАХАЛ', 'צה״ל'],
  [/(^|\.)centcom\.mil$/, 'CENTCOM', 'CENTCOM'],
  [/(^|\.)(defense|war)\.gov$/, 'Пентагон', 'הפנטגון'],
  [/(^|\.)treasury\.gov$/, 'Минфин США', 'משרד האוצר האמריקאי'],
  [/(^|\.)state\.gov$/, 'Госдеп США', 'מחלקת המדינה האמריקאית'],
  [/(^|\.)whitehouse\.gov$/, 'Белый дом', 'הבית הלבן'],
  [/(^|\.)justice\.gov$/, 'Минюст США', 'משרד המשפטים האמריקאי'],
  [/(^|\.)dni\.gov$/, 'Разведсообщество США', 'קהילת המודיעין האמריקאית'],
  [/(^|\.)gov\.il$/, 'Правительство Израиля', 'ממשלת ישראל'],
  [/(^|\.)gov\.uk$/, 'Правительство Великобритании', 'ממשלת בריטניה'],
  [/(^|\.)un\.org$/, 'ООН', 'האו״ם'],
  [/(^|\.)iaea\.org$/, 'МАГАТЭ', 'סבא״א'],
  [/(^|\.)ukmto\.org$/, 'UKMTO', 'UKMTO'],
  [/(^|\.)easa\.europa\.eu$/, 'EASA', 'EASA'],
  [/\.mil$/, 'Вооружённые силы США', 'צבא ארה״ב'],
];
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
export function sourceIdentity(source, he) {
  const s = typeof source === 'string' ? { url: source } : source || {};
  const host = hostOf(s.url || s.source_url || s.link);
  const official = OFFICIAL_SOURCES.find(([re]) => re.test(host));
  const named = typeof s.publisher === 'string' && s.publisher.trim() ? s.publisher.trim() : null;
  const kind = ['official', 'party_claim', 'media'].includes(s.kind)
    ? s.kind
    : official
      ? 'official'
      : 'media';
  const name = (named || (official ? official[he ? 2 : 1] : host) || '').slice(0, 60);
  return { kind, name };
}
export function sourceAttribution(sources, he) {
  const list = (Array.isArray(sources) ? sources : []).map(x => sourceIdentity(x, he)).filter(x => x.name);
  const names = kind => [...new Set(list.filter(x => !kind || x.kind === kind).map(x => x.name))];
  const join = arr => (arr.length > 3 ? arr.slice(0, 3).join(', ') + ' …' : arr.join(', '));
  if (!list.length) return { level: 'none', warn: true, text: he ? 'לא צוין מקור' : 'Источник не указан' };
  const claims = names('party_claim');
  if (claims.length)
    return {
      level: 'claim',
      warn: true,
      text: (he ? 'טענת צד: ' : 'Заявление стороны: ') + join(claims),
    };
  const all = names(),
    official = names('official');
  if (official.length === all.length)
    return {
      level: 'official',
      warn: false,
      text: (he ? 'הודעה רשמית: ' : 'Официальное заявление: ') + join(all),
    };
  return {
    level: all.length > 1 ? 'multi' : 'single',
    warn: false,
    text: (all.length > 1 ? (he ? 'מקורות: ' : 'Источники: ') : he ? 'דיווח: ' : 'Сообщение: ') + join(all),
  };
}
