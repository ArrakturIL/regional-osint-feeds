// Concept E hero (owner 21.11): SIG marks are the freshest urgent/important
// items of the home feed — urgent first, at most three, nothing older than 12 h.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/HomeHero/HomeHero.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm, '')
  .replace(/^export /gm, '');
const load = he => {
  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat() });
  const ctx = { UI_HE: he, h, t: (tag, className, ...c) => h(tag, { className }, ...c), Date };
  vm.runInNewContext(src + '\nthis.heroSignals = heroSignals; this.HomeHero = HomeHero;', ctx);
  return ctx;
};
const NOW = Date.parse('2026-11-21T16:00:00Z');
const iso = h => new Date(NOW - h * 3600e3).toISOString();

test('signals: urgent before important, newest first, normal and stale dropped, max 3', () => {
  const { heroSignals } = load(false);
  const got = heroSignals(
    [
      { id: 'i1', tier: 'important', time: iso(1) },
      { id: 'n', tier: 'normal', time: iso(0.1) },
      { id: 'u-old', tier: 'urgent', time: iso(13) },
      { id: 'u2', tier: 'urgent', time: iso(3) },
      { id: 'u1', tier: 'urgent', time: iso(2) },
      { id: 'i2', tier: 'important', time: iso(0.5) },
    ],
    NOW,
  );
  assert.equal(JSON.stringify(got.map(s => s.id)), '["u1","u2","i2"]');
  assert.equal(heroSignals(null, NOW).length, 0);
});

test('hero renders the localized headline; labels follow the signal tier', () => {
  for (const he of [false, true]) {
    const { HomeHero } = load(he);
    const out = [];
    const walk = n => {
      if (typeof n === 'string') out.push(n);
      else if (n && typeof n === 'object') (n.children || []).forEach(walk);
    };
    walk(HomeHero({ stories: [{ id: 'a', tier: 'urgent', time: new Date().toISOString() }] }));
    const text = out.join(' ');
    assert.match(text, he ? /מה קורה באזור/ : /Что происходит/);
    assert.match(text, he ? /SIG-01 · דחוף/ : /SIG-01 · СРОЧНО/);
  }
});
