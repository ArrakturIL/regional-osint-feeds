import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ownership,
  PAGE_PATHS,
  EDITOR_ENDPOINTS,
  LOCAL_ENDPOINTS,
  MONITOR_ENDPOINTS,
} from '../../backend/pages/src/routes.js';
test('all eleven Pages routes (10 locale + /ops) use immutable local HTML assets', () => {
  assert.equal(Object.keys(PAGE_PATHS).length, 11);
  for (const [route, asset] of Object.entries(PAGE_PATHS)) {
    assert.deepEqual(ownership(route), { kind: 'html', asset: '/' + asset });
    if (route !== '/') assert.deepEqual(ownership(route + '/'), { kind: 'html', asset: '/' + asset });
  }
});
test('existing Editor API routes are serviced by the already deployed Editor Worker', () => {
  for (const path of EDITOR_ENDPOINTS)
    assert.deepEqual(ownership(path), { kind: 'editor', upstream: path }, path);
  assert.deepEqual(ownership('/api/analyst-posts/mossad-iran-some-id'), {
    kind: 'editor',
    upstream: '/api/analyst-posts/mossad-iran-some-id',
  });
});
test('monitor public API aliases specify requested locale explicitly', () => {
  for (const [path, meta] of Object.entries(MONITOR_ENDPOINTS))
    assert.deepEqual(ownership(path), { kind: 'monitor', ...meta });
  assert.equal(ownership('/api/rw-localized/satellite').lang, 'he');
});
test('locally generated API remains owned by Pages, not blindly proxied', () => {
  for (const path of LOCAL_ENDPOINTS) assert.deepEqual(ownership(path), { kind: 'pages', upstream: path });
});
test('undocumented internal APIs never become publicly accessible by accident', () => {
  for (const path of [
    '/api/translation-queue',
    '/summary',
    '/api/monitor/raw',
    '/api/analyst-posts/../../health',
    '/api/secret',
    '/api/health',
  ])
    assert.equal(ownership(path).kind, 'not_found', path);
});

test('deep links to individual analyst posts preserve one shared page and locale', () => {
  for (const slug of ['mossad-iran-2026', 'a1', 'post-123']) {
    assert.deepEqual(ownership('/analysts/' + slug), { kind: 'html', asset: '/analysts/index.html' });
    assert.deepEqual(ownership('/he/analysts/' + slug), { kind: 'html', asset: '/he/analysts/index.html' });
  }
  for (const url of [
    '/analysts/../../secret',
    '/he/analysts/%2e%2e',
    '/analysts/space in slug',
    '/he/analysts/',
    '/he/analysts/foo/bar',
  ]) {
    if (url.endsWith('/')) continue;
    assert.notEqual(ownership(url).kind, 'html', url);
  }
});

test('sitemap.xml is served as a static asset (22.11)', () => {
  assert.equal(ownership('/sitemap.xml').kind, 'asset');
  assert.equal(ownership('/robots.txt').kind, 'asset');
});
