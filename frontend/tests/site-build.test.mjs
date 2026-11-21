import { assemble } from '../scripts/build.mjs';
import { assembleStyles } from '../scripts/build-styles.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { withBeacon } from '../scripts/beacon.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  dest = resolve(root, 'dist');
const load = s => readFileSync(resolve(dest, s), 'utf8');
test('exact original vendor runtime scripts are retained', () => {
  const react = load('assets/react.js'),
    dom = load('assets/react-dom.js');
  assert.equal(react.length, 10751);
  assert.equal(dom.length, 131835);
  assert.match(react, /c\.version="18\.3\.1"/);
  assert.match(dom, /18\.3\.1-next-f1338f8080-20240426/);
});
test('all eight locale routes retain exact document HTML', () => {
  for (const lang of ['ru', 'he'])
    for (const page of ['home', 'events', 'data', 'analysts']) {
      const source = readFileSync(resolve(root, 'documents', lang, page + '.html'), 'utf8');
      const route = (lang === 'he' ? 'he/' : '') + (page === 'home' ? '' : page + '/') + 'index.html';
      assert.ok(existsSync(resolve(dest, route)));
      // F-06: only the asset version markers differ; each is the asset's own content hash.
      // 20.11: plus the Web Analytics beacon before </head>, nothing else.
      const out = load(route);
      assert.equal(
        out.replace(/\?v=[0-9a-f]{12}"/g, '?v=rw-editor-bottom-v16"'),
        withBeacon(source),
        route + ' changed',
      );
      for (const name of ['react.js', 'react-dom.js', 'app.js', 'app.css'])
        assert.ok(
          out.includes(
            '/assets/' +
              name +
              '?v=' +
              createHash('sha256')
                .update(load('assets/' + name))
                .digest('hex')
                .slice(0, 12) +
              '"',
          ),
          route + ' ' + name + ' hash',
        );
    }
});
test('frontend CSS and JS exactly match their current modular assemblers', () => {
  assert.equal(load('assets/app.js'), assemble());
  assert.equal(load('assets/app.css'), assembleStyles());
});
test('2077 theme: every self-hosted font URL resolves to a built file with a matching content hash; reduced motion is honoured', () => {
  const css = load('assets/app.css');
  const urls = [...css.matchAll(/url\((\/assets\/fonts\/([a-z0-9-]+\.woff2)\?v=([0-9a-f]{12}))\)/g)];
  assert.equal(urls.length, 8, 'eight @font-face sources');
  for (const [, , file, hash] of urls) {
    const bytes = readFileSync(resolve(dest, 'assets/fonts', file));
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 12), hash, file);
  }
  assert.doesNotMatch(css, /__FONT_/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^]*\.page-intro::after\{display:none\}/);
  assert.ok(existsSync(resolve(root, 'vendor/fonts/LICENSE-rubik.txt')), 'OFL notices kept with the fonts');
});
test('Web Analytics beacon: on the 8 public pages, not on /ops', () => {
  const pages = ['index.html', 'events/index.html', 'data/index.html', 'analysts/index.html'].flatMap(p => [
    p,
    'he/' + p,
  ]);
  for (const p of pages)
    assert.match(
      load(p),
      /cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token":"[0-9a-f]{32}"\}'/,
      p,
    );
  assert.doesNotMatch(load('ops/index.html'), /cloudflareinsights/);
});
