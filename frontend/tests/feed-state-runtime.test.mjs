// F-04: a failed API pull becomes a classified, reader-facing state with retry;
// last-good data is kept. Runs the real useFeed source with stubbed React hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { classifyFailure, failureText } from '../src/utils/feedFailure.js';

const strip = f =>
  readFileSync(new URL(f, import.meta.url), 'utf8')
    .replace(/^import\s+[^\n]+\n/gm, '')
    .replace(/^export /gm, '');
const hookSrc = strip('../src/hooks/useFeed.js');

function mount(responses, { he = false, hidden = false } = {}) {
  const state = [],
    effects = [],
    calls = [];
  let i = 0;
  const ctx = {
    UI_HE: he,
    classifyFailure,
    AbortController,
    Error,
    Object,
    Date,
    Math,
    Array,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    document: { hidden, addEventListener() {}, removeEventListener() {} },
    useState(init) {
      const k = i++;
      if (!(k in state)) state[k] = init;
      return [
        state[k],
        v => {
          state[k] = v;
        },
      ];
    },
    useRef(init) {
      const k = i++;
      if (!(k in state)) state[k] = { current: init };
      return state[k];
    },
    useEffect(fn) {
      effects.push(fn);
    },
    fetch: async url => {
      calls.push(url);
      const r = responses.shift();
      if (r instanceof Error) throw r;
      return r;
    },
  };
  vm.runInNewContext(hookSrc + '\nthis.useFeed = useFeed;', ctx);
  const render = () => {
    i = 0;
    return ctx.useFeed('/api/news', 60000, true);
  };
  render();
  effects[0]();
  return { render, calls, settle: () => new Promise(r => setTimeout(r, 0)) };
}
const json = (body, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

test('503 with nothing loaded: classified as server down, readable RU/HE text, no raw HTTP in message', async () => {
  const m = mount([json({ error: 'x' }, 503)]);
  await m.settle();
  const f = m.render();
  assert.equal(f.value, null);
  assert.deepEqual([f.failure.kind, f.failure.status], ['http', 503]);
  assert.equal(failureText(f.failure, false), 'Сервер временно недоступен.');
  assert.equal(failureText(f.failure, true), 'השרת אינו זמין זמנית.');
});

test('broken JSON (HTML error page) is "damaged data", not "Unexpected token <"', async () => {
  const m = mount([json('<html>502 Bad Gateway</html>')]);
  await m.settle();
  const f = m.render();
  assert.equal(f.failure.kind, 'invalid');
  assert.doesNotMatch(failureText(f.failure, false), /Unexpected|token|JSON/);
});

test('JSON array / null is invalid too', async () => {
  for (const body of ['[]', 'null']) {
    const m = mount([json(body)]);
    await m.settle();
    assert.equal(m.render().failure.kind, 'invalid', body);
  }
});

test('network failure and timeout are told apart', async () => {
  const net = mount([new TypeError('Failed to fetch')]);
  await net.settle();
  assert.equal(net.render().failure.kind, 'network');
  const slow = mount([Object.assign(new Error('aborted'), { name: 'AbortError' })]);
  await slow.settle();
  assert.equal(slow.render().failure.kind, 'timeout');
});

test('429 gets a "try in a minute" message', () => {
  assert.match(failureText(classifyFailure(new Error('HTTP 429'), 429), false), /через минуту/);
});

test('failure after success keeps last-good value; retry() refetches and clears the failure', async () => {
  const m = mount([json({ articles: [1] }), json({}, 500), json({ articles: [2] })]);
  await m.settle();
  let f = m.render();
  assert.deepEqual(f.value.articles, [1]);
  f.retry();
  await m.settle();
  f = m.render();
  assert.deepEqual(f.value.articles, [1], 'last-good data stays on screen');
  assert.equal(f.failure.status, 500);
  assert.ok(f.update > 0);
  f.retry();
  await m.settle();
  f = m.render();
  assert.deepEqual(f.value.articles, [2]);
  assert.equal(f.failure, null);
  assert.equal(m.calls.length, 3);
});

test('pages render FeedState instead of raw error text', () => {
  const home = readFileSync(new URL('../src/pages/Home/Home.js', import.meta.url), 'utf8');
  const events = readFileSync(new URL('../src/pages/Events/Events.js', import.meta.url), 'utf8');
  const data = readFileSync(new URL('../src/pages/DataRoom/DataRoom.js', import.meta.url), 'utf8');
  for (const [name, src] of [
    ['Home', home],
    ['Events', events],
    ['DataRoom', data],
  ])
    assert.match(src, /h\(FeedState, \{ feed/, name + ' uses FeedState');
  assert.doesNotMatch(home, /labels\.feedError \+ errors\.news|Ошибка загрузки досье: '\) \+ errors\.cases/);
  assert.doesNotMatch(events, /\? null\s*\n\s*: h\(Loading/, 'Events must not render nothing on error');
});

test('first load happens in a hidden (background) tab; nothing more until it is visible', async () => {
  const m = mount([json({ articles: [1] })], { hidden: true });
  await m.settle();
  assert.equal(m.calls.length, 1, 'first load not deferred');
  assert.deepEqual(m.render().value.articles, [1]);
});

test('news archive: failures render the classified reader text, never "HTTP 503" or parser output', async () => {
  const { rwArchiveValidatePayload } = await import('../src/components/NewsArchive/NewsArchive.js').catch(
    () => ({}),
  );
  const src = readFileSync(new URL('../src/components/NewsArchive/NewsArchive.js', import.meta.url), 'utf8');
  assert.match(src, /setError\(failureText\(classifyFailure\(e, e\?\.rwStatus\), !!label\)\)/);
  assert.doesNotMatch(src, /loadError: '[^']*: '/, 'no "<label>: <raw error>" concatenation');
  const invalid = (() => {
    try {
      (
        rwArchiveValidatePayload ||
        (() => {
          throw Object.assign(Error('x'), { rwInvalid: true });
        })
      )({}, 'ru', 0, 12);
    } catch (e) {
      return e;
    }
  })();
  assert.equal(classifyFailure(invalid, undefined).kind, 'invalid');
  assert.equal(
    failureText(classifyFailure(new Error('HTTP 503'), 503), false),
    'Сервер временно недоступен.',
  );
});
