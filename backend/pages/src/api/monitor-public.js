// Safety boundary: Monitor's samples are not independently verified events.
// Only its explicitly publishable signals may reach the public site.
const safePublic = signal => signal && typeof signal === 'object' && !Array.isArray(signal);
export function publicMonitorPayload(upstream, { lang = 'ru', localized = false } = {}) {
  const allow = upstream?.has_publishable_content === true && upstream?.display_policy !== 'hide';
  const all = allow && Array.isArray(upstream.signals) ? upstream.signals.filter(safePublic) : [];
  const signals =
    lang === 'he' ? all.filter(x => x.content_language === 'he' || x.field_languages?.title === 'he') : all;
  const visible = allow && signals.length > 0;
  const base = { display_policy: visible ? 'show' : 'hide' };
  if (localized) return { ...base, items: signals, signals, has_publishable_content: visible };
  return { ...base, has_publishable_content: visible, signals };
}
export async function monitorPublic(request, env, { upstream, lang = 'ru' }) {
  if (!env.MONITOR?.fetch) throw Error('Missing MONITOR service binding');
  const url = new URL(request.url);
  url.pathname = upstream;
  url.searchParams.set('lang', lang);
  const r = await env.MONITOR.fetch(new Request(url, request));
  if (!r.ok) return r;
  const body = await r.json();
  const localized = new URL(request.url).pathname.startsWith('/api/rw-localized/');
  return Response.json(publicMonitorPayload(body, { lang, localized }), {
    headers: { 'Cache-Control': 'public,max-age=60', 'X-Content-Type-Options': 'nosniff' },
  });
}
