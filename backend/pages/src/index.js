import { ownership } from './routes.js';
import { overviewFromD1 } from './api/overview.js';
import { dataFromD1 } from './api/data.js';
import { monitorPublic } from './api/monitor-public.js';
import { opsFromD1 } from './api/ops.js';
// Self-contained Cloudflare Pages advanced-mode Worker.
const jsonError = (error, status) =>
  Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
const alias = Object.freeze({
  '/api/rw-localized/analysts': '/api/analyst-posts?lang=he&limit=20',
  '/api/rw-localized/profiles': '/api/analysts?lang=he',
});
async function assets(request, env, assetPath) {
  if (!env.ASSETS?.fetch) throw Error('Missing Pages ASSETS binding');
  if (!assetPath) return env.ASSETS.fetch(request);
  // Pages redirects /index.html and /section/index.html to canonical directory URLs.
  // Fetch the canonical route to prevent redirect loops in advanced-mode _worker.js.
  const target = new URL(request.url);
  target.pathname = assetPath.endsWith('/index.html') ? assetPath.slice(0, -'index.html'.length) : assetPath;
  return env.ASSETS.fetch(new Request(target, request));
}
async function editor(request, env, upstream) {
  if (!env.EDITOR?.fetch) throw Error('Missing EDITOR service binding');
  const target = new URL(request.url);
  if (upstream) {
    const u = new URL(upstream, 'https://editor.internal');
    target.pathname = u.pathname;
    target.search = u.search || target.search;
  }
  return env.EDITOR.fetch(new Request(target, request));
}
export async function handlePages(request, env) {
  const url = new URL(request.url),
    path = url.pathname,
    route = ownership(path);
  if (request.method !== 'GET' && request.method !== 'HEAD') return jsonError('method_not_allowed', 405);
  try {
    if (route.kind === 'html') return await assets(request, env, route.asset);
    if (route.kind === 'asset') {
      const response = await assets(request, env);
      // F-06: build-site stamps ?v=<12-hex content hash>; such a URL never changes
      // its bytes, so browsers may keep it for a year. Other asset URLs keep the
      // platform default (revalidate).
      if (response.status !== 200 || !/^[0-9a-f]{12}$/.test(url.searchParams.get('v') || '')) return response;
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(response.body, { status: 200, headers });
    }
    if (route.kind === 'editor')
      return await editor(request, env, route.upstream === path ? null : route.upstream);
    if (route.kind === 'monitor') return await monitorPublic(request, env, route);
    if (route.kind === 'pages') {
      if (Object.hasOwn(alias, route.upstream)) return await editor(request, env, alias[route.upstream]);
      if (route.upstream === '/api/overview') return Response.json(await overviewFromD1(env));
      if (route.upstream === '/api/data') return Response.json(await dataFromD1(env));
      if (route.upstream === '/api/ops') return await opsFromD1(request, env);
    }
    if (path.startsWith('/api/') || path === '/summary') return jsonError('not_found', 404);
    return await assets(request, env);
  } catch (error) {
    console.error('Pages route failed', route.kind, path, String(error).slice(0, 160));
    return jsonError('upstream_unavailable', 503);
  }
}
export default { fetch: handlePages };
