// Q4 (QA 19.11): the home page printed "Последнее сравнение выполнено" next to
// "Последний анализ недоступен": the line was unconditional, and the monitor's
// 'partial' outcome was unknown to /api/overview.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { assembleOverview } from '../../backend/pages/src/api/overview.js';

const src = readFileSync(new URL('../src/pages/Home/Home.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm, '')
  .replace('export function HomeV2', 'function HomeV2');

function texts(node, out = []) {
  if (node == null || node === false) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach(n => texts(n, out));
    return out;
  }
  (node.children || []).forEach(n => texts(n, out));
  return out;
}
function render(he, cases) {
  const h = (type, props, ...children) => ({ type, props, children });
  const stub = () => null;
  const ctx = {
    UI_HE: he,
    h,
    t: (tag, cls, ...c) => h(tag, { className: cls }, ...c),
    fmtTime: () => '',
    simpleTime: () => '',
    useState: v => [v, () => {}],
    Digest: stub,
    Editorial: stub,
    HomeHero: stub,
    TopNow: stub,
    Loading: stub,
    GoLink: stub,
    NewsMasonry: stub,
    Intro: stub,
    FeedState: stub,
    Head: stub,
    StoryTeaser: stub,
    UiIcon: stub,
  };
  const view = vm.runInNewContext(src + '\nHomeV2(props)', {
    ...ctx,
    props: {
      visible: true,
      overview: { analysis: { state: 'partial' } },
      news: null,
      cases,
      go() {},
      errors: {},
      feeds: {},
    },
  });
  return texts(view).join(' | ');
}

test('/api/overview: monitor outcome partial is a known state, not "unavailable"', () => {
  const o = assembleOverview({ latestRun: { outcome: 'partial', recorded_at_ms: 1795000000000 } });
  assert.equal(o.analysis.state, 'partial');
  assert.equal(o.analysis.title, 'Последний анализ выполнен частично');
  assert.equal(assembleOverview({ latestRun: { outcome: 'garbage' } }).analysis.state, 'unknown');
});

test('home says "compared" only when two checks were actually compared', () => {
  const insufficient = { digestState: 'insufficient_comparison', sourceComparable: 0 };
  const ok = { digestState: 'ok', sourceComparable: 7 };
  assert.doesNotMatch(render(false, insufficient), /сравнение выполнено/);
  assert.match(render(false, insufficient), /Сравнить с прошлой проверкой не удалось/);
  assert.match(render(false, ok), /Последнее сравнение выполнено/);
  assert.match(render(true, insufficient), /לא ניתן היה להשוות/);
  assert.match(render(true, insufficient), /ניתוח חלקי/);
  // While loading there is nothing to claim either way.
  assert.doesNotMatch(render(false, { digestState: 'loading' }), /сравнен|Сравнить/i);
  assert.doesNotMatch(render(false, null), /сравнен|Сравнить/i);
});
