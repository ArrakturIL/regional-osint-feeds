import { safePublishedComment } from '../editorial/comment-policy.mjs';

export const DAY = 86400000;

export function val(s, len = 1800) {
  return String(s || '')
    .trim()
    .slice(0, len);
}
export function sourceText(kind, row) {
  // Owner decision 18.11: Hebrew is translated from the article's original,
  // never from the Russian translation (headline_ru) of it.
  if (kind === 'news')
    return {
      title: val(row.headline, 260),
      body: val(row.summary, 650),
      comment: val(safePublishedComment(row, row.comment), 300),
    };
  if (kind === 'editorial') return { title: val(row.headline, 260), body: val(row.text, 1900), comment: '' };
  if (kind === 'analyst')
    return { title: val(row.headline, 260), body: val(row.summary, 850), comment: val(row.short_quote, 300) };
  if (kind === 'profile')
    return { title: val(row.display_name, 180), body: val(row.description, 600), comment: '' };
  if (kind === 'story') {
    const p = typeof row.payload === 'string' ? JSON.parse(row.payload) : row;
    return {
      title: val(
        p.title_ru ||
          p.headline_ru ||
          p.title ||
          p.headline ||
          String(p.finding || '')
            .split(/[.;]/, 1)[0]
            .trim(),
        240,
      ),
      // Q8: monitor dossiers without summary_ru carry their text in details,
      // assessment or change; only strings count (some are objects).
      body: val(
        [
          p.summary_ru,
          p.description_ru,
          p.event_summary_ru,
          p.finding,
          p.what_changed,
          p.details,
          p.assessment,
          p.change,
        ].find(x => typeof x === 'string' && x.trim()),
        1050,
      ),
      comment: '',
    };
  }
  return { title: '', body: '', comment: '' };
}
export async function fingerprint(t) {
  const data = new TextEncoder().encode(JSON.stringify([t.title, t.body, t.comment]));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash, v => v.toString(16).padStart(2, '0')).join('');
}

// Pre-18.11 Hebrew translations were made from the Russian pivot (headline_ru).
// They stay visible, verified against that pivot, until they are re-translated
// from the original by hand (manual backlog, not the automatic translator).
export function legacyNewsPivotText(row) {
  return {
    title: val(row.headline_ru || row.headline, 260),
    body: val(row.summary_ru || row.summary, 650),
    comment: val(safePublishedComment(row, row.comment), 300),
  };
}
export async function newsHebrewSource(row, cachedHash) {
  const original = sourceText('news', row);
  if (!cachedHash) return { text: original, legacy: false };
  const pivot = legacyNewsPivotText(row);
  if (JSON.stringify(pivot) === JSON.stringify(original) || cachedHash === (await fingerprint(original)))
    return { text: original, legacy: false };
  return (await fingerprint(pivot)) === cachedHash
    ? { text: pivot, legacy: true }
    : { text: original, legacy: false };
}
