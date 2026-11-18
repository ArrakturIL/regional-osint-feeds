// STATUS #12: focus after in-app navigation and first-visit #anchor deep links.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rwFocusMain, rwFollowInitialHash } from '../src/utils/routeFocus.js';

function fakeDom(hash = '') {
  const elements = new Map();
  const listeners = new Map();
  const timers = [];
  let observerCb = null;
  const doc = {
    activeElement: null,
    body: {},
    getElementById: id => elements.get(id) || null,
  };
  const el = id => {
    const attrs = new Map();
    const node = {
      id,
      scrolls: 0,
      focusOpts: null,
      hasAttribute: k => attrs.has(k),
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: k => attrs.get(k),
      focus(opts) {
        this.focusOpts = opts;
        doc.activeElement = this;
      },
      scrollIntoView() {
        this.scrolls++;
      },
    };
    return node;
  };
  const win = {
    location: { hash },
    addEventListener: (t, fn) => listeners.set(t, fn),
    removeEventListener: t => listeners.delete(t),
    setTimeout: fn => timers.push(fn) && timers.length,
    clearTimeout: id => (timers[id - 1] = null),
    MutationObserver: class {
      constructor(cb) {
        observerCb = cb;
      }
      observe() {}
      disconnect() {
        observerCb = null;
      }
    },
  };
  return {
    doc,
    win,
    add: id => (elements.set(id, el(id)), elements.get(id)),
    mutate: () => observerCb && observerCb(),
    fire: t => listeners.get(t) && listeners.get(t)(),
    runTimers: () => timers.splice(0).forEach(fn => fn && fn()),
    listeners,
  };
}

test('route change moves focus to main without scrolling', () => {
  const d = fakeDom();
  const main = d.add('main-content');
  assert.equal(rwFocusMain(d.doc), true);
  assert.equal(d.doc.activeElement, main);
  assert.equal(main.getAttribute('tabindex'), '-1');
  assert.deepEqual(main.focusOpts, { preventScroll: true });
});

test('missing main is a no-op', () => {
  assert.equal(rwFocusMain(fakeDom().doc), false);
});

test('anchor rendered after load is followed while content above grows', () => {
  const d = fakeDom('#changes');
  rwFollowInitialHash(d.doc, d.win);
  d.mutate(); // feeds still loading, no section yet
  const target = d.add('changes');
  d.mutate(); // section appears
  d.mutate(); // content above grows
  assert.equal(target.scrolls, 2);
});

test('reader input stops following the anchor', () => {
  const d = fakeDom('#changes');
  const target = d.add('changes');
  rwFollowInitialHash(d.doc, d.win);
  assert.equal(target.scrolls, 1);
  d.fire('wheel');
  d.mutate();
  assert.equal(target.scrolls, 1);
  assert.equal(d.listeners.size, 0);
});

test('following ends after the settle timeout', () => {
  const d = fakeDom('#changes');
  const target = d.add('changes');
  rwFollowInitialHash(d.doc, d.win);
  d.runTimers();
  d.mutate();
  assert.equal(target.scrolls, 1);
});

test('no hash or a malformed hash does nothing', () => {
  for (const hash of ['', '#', '#%E0%A4%A']) {
    const d = fakeDom(hash);
    const stop = rwFollowInitialHash(d.doc, d.win);
    assert.equal(typeof stop, 'function');
    assert.equal(d.listeners.size, 0);
  }
});
