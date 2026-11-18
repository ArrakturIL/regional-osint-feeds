import { HEADERS, respond } from './read-core.mjs';
import { readLocalizedNews } from './news-reader.mjs';
import { readLocalizedEditorialNotes } from './editorial-reader.mjs';
import { readLocalizedStories } from './stories-reader.mjs';
import { readLocalizedAnalysts } from './analyst-api.mjs';
import { translateScheduled } from './scheduled.mjs';
export { fingerprint } from './shared.mjs';
export { localizeNewsRow } from './news-reader.mjs';
export { storyProvenance } from './stories-reader.mjs';
// REGIONAL WATCH: locale-aware public readers, no client-side credentials.
function locale(request) {
  const l = new URL(request.url).searchParams.get('lang') || 'ru';
  return l === 'ru' || l === 'he' ? l : null;
}
export async function fetchLocalized(request, env, analystService) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'GET') return respond({ error: 'read_only' }, 405);
  const lang = locale(request);
  if (!lang) return respond({ error: 'unsupported_language', supported: ['ru', 'he'] }, 400);
  const url = new URL(request.url),
    path = url.pathname;
  const rawLimit = url.searchParams.get('limit'),
    rawOffset = url.searchParams.get('offset');
  const positiveInt = v => v !== null && /^\d+$/.test(v) && Number.isSafeInteger(Number(v));
  if (rawLimit !== null && (!positiveInt(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 40))
    return respond({ error: 'invalid_limit', message: 'limit must be an integer from 1 to 40' }, 400);
  if (rawOffset !== null && (!positiveInt(rawOffset) || Number(rawOffset) > 2000))
    return respond({ error: 'invalid_offset', message: 'offset must be an integer from 0 to 2000' }, 400);
  const lim = rawLimit === null ? 20 : Number(rawLimit);
  if (path === '/api/languages')
    return respond({
      default: 'ru',
      supported: ['ru', 'he'],
      requested_language: lang,
      direction: { ru: 'ltr', he: 'rtl' },
    });
  if (path === '/api/news') {
    return readLocalizedNews(env, url, lang, lim, rawOffset);
  }
  if (path === '/api/editorial-notes') {
    return readLocalizedEditorialNotes(env, lang, lim);
  }
  if (path === '/api/stories') {
    return readLocalizedStories(env, lang, lim);
  }
  if (
    path === '/api/analysts' ||
    path === '/api/analyst-posts' ||
    /^\/api\/analyst-posts\/[a-z0-9-]+$/.test(path)
  ) {
    return readLocalizedAnalysts(request, env, analystService, lang, path);
  }
  return respond({ error: 'not_found' }, 404);
}

export default { fetch: fetchLocalized, scheduled: translateScheduled };
