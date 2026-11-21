import test from 'node:test';
import assert from 'node:assert/strict';
import pages from '../../backend/pages/src/index.js';
import { publicMonitorPayload } from '../../backend/pages/src/api/monitor-public.js';
const request = (pathname, method = 'GET') =>
  new Request('https://regional-watch.pages.dev' + pathname, { method });
function mockEnv() {
  const seen = { assets: [], editor: [], monitor: [], sql: [] };
  const env = {
    ASSETS: {
      async fetch(req) {
        seen.assets.push(new URL(req.url).pathname);
        return new Response('asset', { status: 200 });
      },
    },
    EDITOR: {
      async fetch(req) {
        const u = new URL(req.url);
        seen.editor.push(u.pathname + u.search);
        return Response.json({ editor: u.pathname, query: u.search });
      },
    },
    MONITOR: {
      async fetch(req) {
        const u = new URL(req.url);
        seen.monitor.push(u.pathname + u.search);
        return Response.json({
          display_policy: 'hide',
          has_publishable_content: false,
          signals: [{ content_language: 'he', title: 'unsourced' }],
        });
      },
    },
    DB: {
      prepare(sql) {
        seen.sql.push(sql);
        return { sql };
      },
      async batch(statements) {
        return statements.length === 3
          ? [
              { results: [{ outcome: 'no_alert', recorded_at_ms: 1794689958000 }] },
              { results: [] },
              { results: [] },
            ]
          : [
              {
                results: [
                  {
                    observed_at: 1794689958000,
                    payload: JSON.stringify({
                      market_id: 'A',
                      question: 'Future market',
                      outcomes: ['Yes', 'No'],
                      outcome_prices: [0.3, 0.7],
                      volume_24h: 120,
                      liquidity: 50,
                      ends_at: '2099-01-01T00:00:00Z',
                      url: 'https://polymarket.com/event/a',
                    }),
                  },
                ],
              },
              { results: [] },
              { results: [] },
              { results: [] },
            ];
      },
    },
  };
  return { env, seen };
}
test('all eight locale HTML routes are served from this deployment ASSETS', async () => {
  const { env, seen } = mockEnv();
  for (const [pathname, asset] of [
    ['/', '/'],
    ['/he', '/he/'],
    ['/events', '/events/'],
    ['/he/events', '/he/events/'],
    ['/data', '/data/'],
    ['/he/data', '/he/data/'],
    ['/analysts', '/analysts/'],
    ['/he/analysts', '/he/analysts/'],
  ]) {
    const r = await pages.fetch(request(pathname + '?keep=1'), env);
    assert.equal(r.status, 200);
    assert.equal(seen.assets.at(-1), asset, pathname);
  }
});
test('React vendors and JS/CSS files are served only as local assets', async () => {
  const { env, seen } = mockEnv();
  const r = await pages.fetch(request('/assets/react-dom.js?v=original'), env);
  assert.equal(r.status, 200);
  assert.equal(seen.assets.at(-1), '/assets/react-dom.js');
});
test('F-06: content-hashed asset URLs are immutable; unversioned ones keep revalidation', async () => {
  const { env } = mockEnv();
  const hashed = await pages.fetch(request('/assets/app.js?v=0123456789ab'), env);
  assert.equal(hashed.status, 200);
  assert.equal(hashed.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  for (const u of [
    '/assets/app.js',
    '/assets/app.js?v=rw-editor-bottom-v16',
    '/assets/app.js?v=0123456789abc',
  ]) {
    const r = await pages.fetch(request(u), env);
    assert.equal(r.status, 200);
    assert.notEqual(r.headers.get('Cache-Control'), 'public, max-age=31536000, immutable', u);
  }
});
test('Editor service binding forwards the public routes with original query', async () => {
  const { env, seen } = mockEnv();
  for (const url of [
    '/api/news?lang=he&limit=40',
    '/api/stories?lang=ru',
    '/api/official-posts?lang=ru',
    '/api/analyst-posts/post-123?lang=he',
  ]) {
    const r = await pages.fetch(request(url), env);
    assert.equal(r.status, 200);
    assert.equal(seen.editor.at(-1), url);
  }
});
test('Hebrew analyst aliases preserve the existing Editor response format', async () => {
  const { env, seen } = mockEnv();
  await pages.fetch(request('/api/rw-localized/analysts'), env);
  await pages.fetch(request('/api/rw-localized/profiles'), env);
  assert.deepEqual(seen.editor, ['/api/analyst-posts?lang=he&limit=20', '/api/analysts?lang=he']);
});
test('Monitor data remains hidden when no evidence is publishable, even if sample rows exist', async () => {
  const { env, seen } = mockEnv();
  let r = await pages.fetch(request('/api/rw/aviation'), env);
  let body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.display_policy, 'hide');
  assert.equal(body.has_publishable_content, false);
  assert.equal(body.signals.length, 0);
  r = await pages.fetch(request('/api/rw-localized/satellite'), env);
  body = await r.json();
  assert.equal(body.items.length, 0);
  assert.deepEqual(body.signals, []);
  assert.equal(seen.monitor.at(-1), '/api/satellite-analysis?lang=he');
  const visible = publicMonitorPayload(
    {
      display_policy: 'show',
      has_publishable_content: true,
      signals: [{ content_language: 'en' }, { content_language: 'he' }],
    },
    { lang: 'he', localized: true },
  );
  assert.equal(visible.signals.length, 1);
});
test('local read-only pages endpoints use D1 and preserve output schemas', async () => {
  const { env, seen } = mockEnv();
  const overview = await (await pages.fetch(request('/api/overview'), env)).json();
  assert.equal(overview.analysis.state, 'normal');
  assert.equal(overview.total, 0);
  const data = await (await pages.fetch(request('/api/data'), env)).json();
  assert.deepEqual(
    data.markets.map(m => m.id),
    ['A'],
  );
  assert.deepEqual(data.aviationSamples, []);
  assert.equal(seen.sql.length, 9); // + tension_hours, advisories (21.11)
});
test('private API and methods fail closed; unavailable bindings report 503', async () => {
  const { env, seen } = mockEnv();
  const blocked = await pages.fetch(request('/api/translation-queue'), env);
  assert.equal(blocked.status, 404);
  assert.equal(seen.editor.length, 0);
  const post = await pages.fetch(request('/api/news', 'POST'), env);
  assert.equal(post.status, 405);
  const unavailable = await pages.fetch(request('/api/news'), { ASSETS: env.ASSETS });
  assert.equal(unavailable.status, 503);
  const noD1 = await pages.fetch(request('/api/data'), { ASSETS: env.ASSETS });
  assert.equal(noD1.status, 503);
});

test('canonical Pages HTML assets never redirect to their own routes', async () => {
  const { env } = mockEnv();
  env.ASSETS.fetch = async req => {
    const pathname = new URL(req.url).pathname;
    // Cloudflare Pages redirects /index.html to /, and /area/index.html to /area/.
    if (pathname.endsWith('/index.html')) {
      return Response.redirect(
        'https://regional-watch.pages.dev' + pathname.slice(0, -'index.html'.length),
        308,
      );
    }
    if (
      ['/he', '/events', '/he/events', '/data', '/he/data', '/analysts', '/he/analysts'].includes(pathname)
    ) {
      return Response.redirect('https://regional-watch.pages.dev' + pathname + '/', 308);
    }
    return new Response('HTML ' + pathname, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  for (const [path, canonical] of [
    ['/', '/'],
    ['/?utm_source=chatgpt.com', '/'],
    ['/he', '/he/'],
    ['/he/', '/he/'],
    ['/events', '/events/'],
    ['/events/', '/events/'],
    ['/data', '/data/'],
    ['/he/data', '/he/data/'],
    ['/analysts', '/analysts/'],
    ['/analysts/post-123', '/analysts/'],
    ['/he/analysts/post-123', '/he/analysts/'],
  ]) {
    const response = await pages.fetch(request(path), env);
    assert.equal(
      response.status,
      200,
      'Redirect loop risk on ' + path + ': ' + response.headers.get('location'),
    );
    assert.equal(await response.text(), 'HTML ' + canonical, path);
  }
});

test('integration release branch deploys isolated Pages preview with live API smoke, not production', async () => {
  const { readFileSync } = await import('node:fs');
  const workflow = readFileSync(
    new URL('../../.github/workflows/regional-watch-app-check.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /release\/regional-watch-architecture-20261115/);
  assert.match(workflow, /rw-architecture-preview/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.head_ref == 'release\/regional-watch-architecture-20261115'/);
  assert.match(workflow, /github\.base_ref == 'main'/);
  assert.match(workflow, /Cloudflare Pages preview API wiring smoke/);
  for (const api of ['/api/overview', '/api/data', '/api/news?lang=ru', '/api/news?lang=he']) {
    assert.ok(workflow.includes(api), api + ' not checked by preview');
  }
  const prod = workflow.slice(workflow.indexOf('  pages-production:'));
  assert.doesNotMatch(prod, /rw-architecture-preview/);
});
