// Audit 17.11 P0: a render exception must not blank the site. Runs the real
// ErrorBoundary class against a minimal React.Component stand-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const src = readFileSync(new URL('../src/components/ErrorBoundary/ErrorBoundary.js', import.meta.url), 'utf8')
  .replace(/^import\s+[^\n]+\n/gm, '').replace(/^export /gm, '');
function load(he = false) {
  class Component { constructor(props) { this.props = props; } setState(s) { this.state = {...this.state, ...s}; } }
  const logged = [];
  const ctx = {R: {Component}, UI_HE: he, h: (type, props, ...children) => ({type, props, children}),
    console: {error: (...a) => logged.push(a)}, location: {reload() { ctx.reloaded = true; }}};
  vm.runInNewContext(src + '\nthis.ErrorBoundary = ErrorBoundary;', ctx);
  return {ErrorBoundary: ctx.ErrorBoundary, ctx, logged};
}
const text = node => typeof node === 'string' ? node : !node ? '' : (node.children || []).map(text).join(' ');
const find = (node, type) => !node || typeof node !== 'object' ? null : node.type === type ? node : (node.children || []).map(c => find(c, type)).find(Boolean);

test('children render untouched while there is no error', () => {
  const {ErrorBoundary} = load();
  const b = new ErrorBoundary({level: 'page', resetKey: '/', children: 'PAGE'});
  assert.equal(b.render(), 'PAGE');
});

test('a thrown render error becomes an alert with reload and home link (RU), and is logged', () => {
  const {ErrorBoundary, ctx, logged} = load();
  const b = new ErrorBoundary({level: 'page', resetKey: '/events', children: 'PAGE'});
  b.state = {...b.state, ...ErrorBoundary.getDerivedStateFromError(new TypeError('x is undefined'))};
  b.componentDidCatch(new TypeError('x is undefined'), {componentStack: 'at CasesPageV2'});
  const out = b.render();
  assert.equal(out.props.role, 'alert');
  assert.match(text(out), /Этот раздел не удалось показать/);
  assert.equal(find(out, 'a').props.href, '/');
  find(out, 'button').props.onClick();
  assert.equal(ctx.reloaded, true);
  assert.equal(logged.length, 1);
});

test('navigating to another route clears the page-level error', () => {
  const {ErrorBoundary} = load();
  const b = new ErrorBoundary({level: 'page', resetKey: '/events', children: 'PAGE'});
  b.state = {error: new Error('boom')};
  b.props = {level: 'page', resetKey: '/data', children: 'DATA'};
  b.componentDidUpdate({resetKey: '/events'});
  assert.equal(b.render(), 'DATA');
});

test('Hebrew page gets Hebrew text and /he home link; app-level boundary has no home link', () => {
  const {ErrorBoundary} = load(true);
  const page = new ErrorBoundary({level: 'page', resetKey: '/he'});
  page.state = {error: new Error('x')};
  assert.match(text(page.render()), /לא הצלחנו להציג/);
  assert.doesNotMatch(text(page.render()), /[А-Яа-яЁё]/);
  assert.equal(find(page.render(), 'a').props.href, '/he');
  const app = new ErrorBoundary({level: 'app'});
  app.state = {error: new Error('x')};
  assert.equal(find(app.render(), 'a'), undefined);
});

test('the real mount and App wrap pages in the boundary', () => {
  const mount = readFileSync(new URL('../src/app/mount.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app/App.js', import.meta.url), 'utf8');
  assert.match(mount, /h\(ErrorBoundary, \{ level: 'app' \}, h\(App\)\)/);
  assert.match(app, /ErrorBoundary,\s*\{ level: 'page', resetKey: route \}/);
});
