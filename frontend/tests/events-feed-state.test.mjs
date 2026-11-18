// H-02 / F-04 on /events (browser QA 18.11): a failed refresh printed the raw
// "Ошибка загрузки событий: HTTP 503" / "Unexpected token '<'…" above the list,
// and on HE an empty "שגיאה בטעינת אירועים:". The page must show FeedState instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/pages/Events/Events.js', import.meta.url), 'utf8')
  .replace(/^import\s+[^\n]+\n/gm, '')
  .replace(/^export /gm, '');

function render({ he = false, cases, error, feed }) {
  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat() });
  const FeedState = function FeedState() {};
  const ctx = {
    UI_HE: he,
    h,
    t: (type, className, ...children) => h(type, { className }, ...children),
    useState: init => [init, () => {}],
    useRef: init => ({ current: init }),
    useEffect: () => {},
    location: { search: '' },
    URLSearchParams,
    normalizeCase: x => x,
    FeedState,
    Loading() {},
    NewsArchive() {},
    Intro() {},
    Head() {},
    StoryDossier() {},
  };
  vm.runInNewContext(src + '\nthis.view = CasesPageV2(args);', Object.assign(ctx, { args: { visible: true, cases, error, feed } }));
  const nodes = [];
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    nodes.push(n);
    (n.children || []).forEach(walk);
  };
  walk(ctx.view);
  const text = n => (typeof n === 'string' ? n : (n?.children || []).map(text).join(''));
  return { nodes, FeedState, text: nodes.filter(n => n.type === 'p').map(text).join('\n') };
}

const story = { id: 's1', group: 'other' };
const failedFeed = { value: { stories: [story] }, failure: { kind: 'http', status: 503 }, retry() {} };

for (const he of [false, true]) {
  const lang = he ? 'HE' : 'RU';
  test(`${lang}: last-good list with failed refresh shows FeedState, not a raw error`, () => {
    const r = render({ he, cases: { stories: [story] }, error: 'HTTP 503', feed: failedFeed });
    assert.ok(r.nodes.some(n => n.type === r.FeedState), 'FeedState note is rendered');
    assert.doesNotMatch(r.text, /HTTP 503|Ошибка загрузки событий|שגיאה בטעינת אירועים/);
  });
  test(`${lang}: nothing loaded shows exactly one FeedState and no raw parser text`, () => {
    const r = render({ he, cases: null, error: "Unexpected token '<'", feed: { ...failedFeed, value: null } });
    assert.equal(r.nodes.filter(n => n.type === r.FeedState).length, 1);
    assert.doesNotMatch(r.text, /Unexpected token/);
  });
  test(`${lang}: healthy feed has no failure UI`, () => {
    const r = render({ he, cases: { stories: [story] }, error: null, feed: { value: {}, failure: null } });
    assert.equal(r.nodes.filter(n => n.type === r.FeedState).length, 0);
  });
}
