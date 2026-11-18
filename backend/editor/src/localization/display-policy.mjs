// B4: page language rules for untranslated content (owner decision, 18.11).
//   RU page: HE and EN originals may be shown while a translation is pending.
//   HE page: EN originals may be shown; Russian text is never shown.
//   Arabic originals are never shown untranslated, on any page.
// Language here is the writing script of the text itself, so a pivot
// translation (headline_ru) is never mistaken for the original.
// Script is enough for these rules: every Latin-script language is allowed on
// both pages, so a statistical detector (franc-min) would not change a verdict.
import { val } from './shared.mjs';

const SCRIPTS = [
  ['ru', /\p{Script=Cyrillic}/gu],
  ['he', /\p{Script=Hebrew}/gu],
  ['ar', /\p{Script=Arabic}/gu],
  ['en', /\p{Script=Latin}/gu],
];

// Dominant script of the text, or null when it has no letters.
export function scriptLanguage(text) {
  const s = String(text || '');
  let best = null,
    max = 0;
  for (const [lang, re] of SCRIPTS) {
    const n = (s.match(re) || []).length;
    if (n > max) {
      max = n;
      best = lang;
    }
  }
  return best;
}

export function allowedOnPage(page, language) {
  if (!language || language === page) return true;
  if (language === 'ar') return false;
  return !(page === 'he' && language === 'ru');
}

const fits = (page, text) => allowedOnPage(page, scriptLanguage(text));

/**
 * Display contract for one news row on page `lang`, given its localization `t`
 * (from localizeNewsRow). Returns the record to show, or null when the item
 * must be withheld from this page until it is translated.
 */
export function displayForPage(row, t, lang) {
  const title = val(row.headline, 260),
    body = val(row.summary, 650);
  const source = scriptLanguage(title) || scriptLanguage(body) || 'en';
  const translated =
    t.content_language === lang &&
    (t.translation_status === 'available' || t.translation_status === 'source');
  if (translated) {
    return {
      ...t,
      comment: fits(lang, t.comment) ? t.comment : '',
      source_language: source,
      language_shown: lang,
    };
  }
  // Untranslated: show the article's own original, never a pivot translation.
  if (!allowedOnPage(lang, source)) return null;
  return {
    ...t,
    title,
    body: fits(lang, body) ? body : '',
    comment: fits(lang, t.comment) ? t.comment : '',
    content_language: source,
    source_language: source,
    language_shown: source,
  };
}
