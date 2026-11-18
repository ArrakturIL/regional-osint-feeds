// #14: the editor's note shows what was checked (verified_note), only in the page language.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/Editorial/Editorial.js', import.meta.url), 'utf8')
  .replace(/^import\s[^;]*?from\s*['"][^'"]+['"];?\n/gm, '')
  .replace(/^export /gm, '');
function render(he, note) {
  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat() });
  const ctx = { UI_HE: he, h, t: (type, className, ...c) => h(type, { className }, ...c), fmtTime: () => '18.11', Card() {}, External() {}, UiIcon() {} };
  vm.runInNewContext(src + '\nthis.view = Editorial(args);', Object.assign(ctx, { args: { notes: [note] } }));
  const text = n => (typeof n === 'string' ? n : n && typeof n === 'object' ? (n.children || []).map(text).join('') : '');
  return text(ctx.view);
}
const base = { headline: 'H', text: 'T', time: '2026-11-18T10:00:00Z', content_language: 'ru' };
test('RU: verified note is shown as «Что проверено»', () => {
  const out = render(false, { ...base, verifiedNote: 'Reuters 18.11: доклад', verifiedLanguage: 'ru' });
  assert.match(out, /Что проверено: Reuters 18\.11: доклад/);
});
test('HE: a Russian-only verified note is not shown on the Hebrew page', () => {
  const out = render(true, { ...base, content_language: 'he', verifiedNote: 'Reuters 18.11: доклад', verifiedLanguage: 'ru' });
  assert.doesNotMatch(out, /[Ѐ-ӿ]/);
});
test('HE: a Hebrew verified note is shown as «מה נבדק»', () => {
  const out = render(true, { ...base, content_language: 'he', verifiedNote: 'רויטרס 18.11', verifiedLanguage: 'he' });
  assert.match(out, /מה נבדק: רויטרס 18\.11/);
});
