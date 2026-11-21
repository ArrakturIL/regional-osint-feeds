// ROUTE OWNERSHIP — copied from the live frontend calls, Editor v64 and Monitor v47.
// This inventory is a migration guard, not a new public API.
export const EDITOR_ENDPOINTS = Object.freeze([
  '/api/news',
  '/api/events',
  '/api/stories',
  '/api/editorial-notes',
  '/api/changes',
  '/api/languages',
  '/api/analysts',
  '/api/analyst-posts',
  '/api/official-posts',
]);
export const LOCAL_ENDPOINTS = Object.freeze([
  '/api/overview',
  '/api/data',
  '/api/rw-localized/analysts',
  '/api/rw-localized/profiles',
  '/api/ops',
]);
export const MONITOR_ENDPOINTS = Object.freeze({
  '/api/rw/aviation': { upstream: '/api/aviation-analysis', lang: 'ru' },
  '/api/rw/satellite': { upstream: '/api/satellite-analysis', lang: 'ru' },
  '/api/rw-localized/aviation': { upstream: '/api/aviation-analysis', lang: 'he' },
  '/api/rw-localized/satellite': { upstream: '/api/satellite-analysis', lang: 'he' },
});
const EDITOR = new Set(EDITOR_ENDPOINTS),
  LOCAL = new Set(LOCAL_ENDPOINTS);
export const PAGE_PATHS = Object.freeze({
  '/': 'index.html',
  '/he': 'he/index.html',
  '/feed': 'feed/index.html',
  '/he/feed': 'he/feed/index.html',
  '/events': 'events/index.html',
  '/he/events': 'he/events/index.html',
  '/data': 'data/index.html',
  '/he/data': 'he/data/index.html',
  '/analysts': 'analysts/index.html',
  '/he/analysts': 'he/analysts/index.html',
  '/ops': 'ops/index.html',
});
const normalize = path => (path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path);
export function ownership(pathname) {
  const path = normalize(pathname);
  if (Object.hasOwn(PAGE_PATHS, path)) return { kind: 'html', asset: '/' + PAGE_PATHS[path] };
  if (/^\/analysts\/[a-z0-9-]+$/.test(path)) return { kind: 'html', asset: '/analysts/index.html' };
  if (/^\/he\/analysts\/[a-z0-9-]+$/.test(path)) return { kind: 'html', asset: '/he/analysts/index.html' };
  if (path.startsWith('/assets/') || path === '/sitemap.xml') return { kind: 'asset' };
  if (EDITOR.has(path) || /^\/api\/analyst-posts\/[a-z0-9-]+$/.test(path))
    return { kind: 'editor', upstream: path };
  if (Object.hasOwn(MONITOR_ENDPOINTS, path)) return { kind: 'monitor', ...MONITOR_ENDPOINTS[path] };
  if (LOCAL.has(path)) return { kind: 'pages', upstream: path };
  return { kind: 'not_found' };
}
