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

// #14: the badge says what the dossier actually has, instead of one text for all.
export function dossierStatus(count, he) {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  if (n === 0)
    return { level: 'none', text: he ? 'אין מקור ראשוני שניתן לבדוק' : 'Нет проверяемого первоисточника' };
  if (n === 1)
    return {
      level: 'single',
      text: he ? 'מקור יחיד — ללא אימות עצמאי' : 'Один источник — без независимого подтверждения',
    };
  return {
    level: 'multi',
    text: he
      ? 'כמה מקורות — אין זה אימות עצמאי של כל טענה'
      : 'Несколько источников — это не независимая проверка каждого утверждения',
  };
}
