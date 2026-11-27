import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// 27.11 owner: article text brighter and whiter, at least WCAG AA on every card surface.
const css = readFileSync(new URL('../src/styles/theme-2077.css', import.meta.url), 'utf8');
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
test('article body text is near-white and passes AA on card surfaces', () => {
  const article = css.match(/--rw7-article:(#[0-9a-f]{6})/)[1];
  for (const surface of ['#07110d', '#0c1a15', '#15291f', '#192e27'])
    assert.ok(ratio(article, surface) >= 7, article + ' on ' + surface);
  assert.match(css, /\.news-card p,\.news-detail,[^{]*\{color:var\(--rw7-article\)!important\}/);
});
