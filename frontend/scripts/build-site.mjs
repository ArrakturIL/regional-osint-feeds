import { assembleStyles } from './build-styles.mjs';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assemble } from './build.mjs';
import { withBeacon } from './beacon.mjs';
import { fontFiles, FONT_DIR } from './build-styles.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = resolve(root, 'dist');
const write = (file, bytes) => {
  const p = resolve(dest, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, bytes);
};
const vendor = readFileSync(resolve(root, 'vendor/react.production.min.js'), 'utf8');
const dom = gunzipSync(readFileSync(resolve(root, 'vendor/react-dom.production.min.js.gz'))).toString('utf8');
if (vendor.length !== 10751 || !vendor.includes('c.version="18.3.1"'))
  throw Error('React production snapshot changed');
if (dom.length !== 131835 || !dom.includes('18.3.1-next-f1338f8080-20240426'))
  throw Error('ReactDOM production snapshot changed');
// F-06: each asset URL carries a hash of its own bytes (?v=<12 hex>), so Pages
// can serve it immutable; the documents keep must-revalidate and pick up new
// hashes on the next release. Source documents keep the legacy ?v= marker.
const assetsOut = {
  'react.js': vendor,
  'react-dom.js': dom,
  'app.js': assemble(),
  'app.css': assembleStyles(),
};
const hashes = {};
for (const [name, body] of Object.entries(assetsOut)) {
  write('assets/' + name, body);
  hashes[name] = createHash('sha256').update(body).digest('hex').slice(0, 12);
}
for (const f of fontFiles()) write('assets/fonts/' + f, readFileSync(resolve(FONT_DIR, f)));
export function versionDocument(html, map = hashes) {
  return html.replace(
    /\/assets\/(react\.js|react-dom\.js|app\.js|app\.css)\?v=[A-Za-z0-9._-]+/g,
    (m, name) => '/assets/' + name + '?v=' + map[name],
  );
}
for (const lang of ['ru', 'he'])
  for (const page of ['home', 'feed', 'events', 'data', 'analysts']) {
    const html = readFileSync(resolve(root, 'documents', lang, page + '.html'), 'utf8');
    const path = (lang === 'he' ? 'he/' : '') + (page === 'home' ? '' : page + '/') + 'index.html';
    const out = withBeacon(versionDocument(html));
    if (out === html || !/\?v=[0-9a-f]{12}"/.test(out)) throw Error('asset version not applied: ' + path);
    if (!out.includes('cloudflareinsights.com/beacon.min.js'))
      throw Error('analytics beacon not applied: ' + path);
    write(path, out);
  }
// Owner service page (/ops): one self-contained document, not part of the SPA.
{
  const html = readFileSync(resolve(root, 'documents', 'ops.html'), 'utf8'),
    out = versionDocument(html);
  if (out === html) throw Error('asset version not applied: ops/index.html');
  write('ops/index.html', out);
}
// 21.11: a real 404 page. Its presence also switches Pages asset serving out of
// the SPA fallback, so a missing /assets/… file answers 404 instead of HTML.
{
  const html = readFileSync(resolve(root, 'documents', '404.html'), 'utf8'),
    out = versionDocument(html);
  if (out === html) throw Error('asset version not applied: 404.html');
  write('404.html', out);
}
// 22.11: sitemap for search engines (owner submits it in Search Console).
{
  const base = 'https://regional-watch.pages.dev/';
  const urls = ['ru', 'he'].flatMap(lang =>
    ['', 'feed', 'events', 'data', 'analysts'].map(
      page => base + (lang === 'he' ? 'he' + (page ? '/' : '') : '') + page,
    ),
  );
  write(
    'sitemap.xml',
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls
        .map(
          u =>
            '  <url><loc>' +
            u +
            '</loc><lastmod>' +
            new Date().toISOString().slice(0, 10) +
            '</lastmod><changefreq>hourly</changefreq></url>',
        )
        .join('\n') +
      '\n</urlset>\n',
  );
}
// 27.11: our own robots.txt — the sitemap and the owner-only /ops. Cloudflare may
// prepend its content-signals comment block; that does not change these rules.
write(
  'robots.txt',
  'User-agent: *\nAllow: /\nDisallow: /ops\nDisallow: /api/\n\nSitemap: https://regional-watch.pages.dev/sitemap.xml\n',
);
console.log(
  'Built standalone static Pages payload: 10 locale routes + /ops + 404 + modular frontend assets.',
);
