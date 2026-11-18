// Header section links go through the in-app router (no full reload), like GoLink.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/Header/Header.js', import.meta.url), 'utf8')
  .replace(/^import\s+[^\n]+\n/gm, '')
  .replace(/^export /gm, '');

function render(he, go) {
  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat() });
  const ctx = {
    UI_HE: he, h, t: (type, className, ...c) => h(type, { className }, ...c),
    useState: v => [v, () => {}], useRef: v => ({ current: v }), useEffect: () => {},
    UiIcon() {}, location: { pathname: he ? '/he' : '/', search: '', hash: '' }, localStorage: { setItem() {} },
  };
  vm.runInNewContext(src + '\nthis.view = GlobalHeader(args);', Object.assign(ctx, { args: { active: '/', overview: null, go } }));
  const out = [];
  const walk = n => { if (n && typeof n === 'object') { out.push(n); (n.children || []).forEach(walk); } };
  walk(ctx.view);
  return out.find(n => n.type === 'nav' && n.props.id === 'rw-site-links').children.filter(n => n.type === 'a');
}
const click = (link, mods = {}) => {
  let prevented = false;
  link.props.onClick && link.props.onClick({ button: 0, ...mods, preventDefault: () => (prevented = true) });
  return prevented;
};

for (const he of [false, true]) {
  test(`${he ? 'HE' : 'RU'}: section link click routes in-app`, () => {
    const calls = [];
    const links = render(he, p => calls.push(p));
    assert.equal(links.length, 4);
    assert.equal(click(links[1]), true);
    assert.deepEqual(calls, [he ? '/he/events' : '/events']);
  });
}
test('modifier / middle clicks keep native behaviour (new tab)', () => {
  const calls = [];
  const [, events] = render(false, p => calls.push(p));
  for (const m of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) assert.equal(click(events, m), false);
  assert.equal(calls.length, 0);
});
test('without a router the links stay plain hrefs', () => {
  const [, events] = render(false, undefined);
  assert.equal(click(events), false);
  assert.equal(events.props.href, '/events');
});
