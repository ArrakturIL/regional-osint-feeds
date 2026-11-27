// UCDP block on the Data page (owner 23.11): collapsed by default with a
// casualty warning; the API view trims the collector JSON; a GitHub read
// failure is null, not an error page.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { githubJson, ucdpView } from '../../backend/pages/src/api/data.js';

const raw = {
  source: 'ucdp_ged_candidate',
  version: '26.0.10',
  generated_at: '2026-11-23T02:41:00Z',
  regions: {
    israel: {
      '2026-09': { events: 97, deaths_best: 131, deaths_civilians: 40 },
      '2026-10': { events: 107, deaths_best: 147, deaths_civilians: 50 },
    },
    red_sea: { '2026-10': { events: 262, deaths_best: 1747, deaths_civilians: 3 } },
    bogus: { '2026-10': { events: 1 } },
  },
  latest: [
    {
      date: '2026-10-31',
      region: 'israel',
      where: 'Gaza City',
      side_a: 'Israel',
      side_b: 'Hamas',
      deaths_best: 3,
    },
  ],
};

test('ucdpView keeps six regions, newest month first, and drops unknown keys', () => {
  const v = ucdpView(raw);
  assert.deepEqual(
    v.regions.map(r => r.id),
    ['israel', 'lebanon_syria', 'iran', 'gulf', 'red_sea', 'iraq'],
  );
  assert.deepEqual(
    v.regions[0].months.map(m => m.month),
    ['2026-10', '2026-09'],
  );
  assert.equal(v.regions[0].months[0].civilians, 50);
  assert.equal(v.latest[0].sides, 'Israel — Hamas');
  assert.equal(ucdpView({ source: 'other' }), null);
  assert.equal(ucdpView(null), null);
});

test('githubJson returns null on a failed or non-object answer', async () => {
  assert.equal(await githubJson('x.json', 60, async () => new Response('nope', { status: 404 })), null);
  assert.equal(
    await githubJson('x.json', 60, async () => {
      throw new Error('down');
    }),
    null,
  );
  assert.equal(await githubJson('x.json', 60, async () => Response.json([1])), null);
  assert.deepEqual(await githubJson('x.json', 60, async () => Response.json({ a: 1 })), { a: 1 });
});

const src = readFileSync(new URL('../src/pages/DataRoom/DataRoom.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm, '')
  .replace(/^export /gm, '');
const render = (he, ucdp) => {
  const h = (tag, props, ...children) => ({ tag, props, children: children.flat() });
  const ctx = {
    UI_HE: he,
    h,
    t: (tag, cls, ...content) => ({ tag, props: { className: cls }, children: content.flat() }),
    Head: 'Head',
    Card: 'Card',
    External: 'External',
    ruPlural: (n, f) => f[2],
    useState: x => [x, () => {}],
    fmtTime: () => '',
  };
  ctx.__u = ucdp;
  vm.runInNewContext(src + '\nthis.out = UcdpSection({ ucdp: this.__u }); this.ucdpTable = ucdpTable;', ctx);
  globalThis.ucdpTable = ctx.ucdpTable;
  return ctx.out;
};
const find = (node, pred) =>
  !node || typeof node !== 'object'
    ? null
    : pred(node)
      ? node
      : (node.children || []).reduce((hit, c) => hit || find(c, pred), null);
const text = node =>
  node == null || node === false
    ? ''
    : typeof node !== 'object'
      ? String(node)
      : (node.children || []).map(text).join(' ');

test('UCDP block is collapsed, warns about casualties and names Yemen, not the Red Sea', () => {
  for (const he of [false, true]) {
    const out = render(he, ucdpView(raw));
    const details = find(out, n => n.tag === 'details');
    assert.ok(details, 'a <details> block');
    assert.ok(!details.props.open, 'closed by default');
    const summary = text(find(details, n => n.tag === 'summary'));
    assert.match(summary, he ? /הרוגים/ : /погибших/);
    assert.match(text(details), he ? /תימן/ : /Йемен/);
    assert.doesNotMatch(text(details), /Красное море|ים סוף/);
  }
  assert.equal(render(false, null), null, 'no data, no block');
});

test('UCDP renders a regions × months table, newest month first, deaths in every cell', () => {
  const out = render(false, ucdpView(raw));
  const table = find(out, n => n.tag === 'table');
  assert.ok(table, 'a <table>');
  const head = find(table, n => n.tag === 'thead');
  assert.equal(find(head, n => n.tag === 'tr').children.length, 3, 'region + two months');
  const body = find(table, n => n.tag === 'tbody');
  assert.equal(body.children.length, 6, 'six regions');
  assert.match(text(body.children[0]), /147[\s\S]*131/, 'Israel: October before September');
  assert.match(text(body.children[1]), /—/, 'empty months are a dash');
});

test('ucdpTable keeps four months at most and scales the heat tint', () => {
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month, i) => ({
    month,
    deaths: i * 10,
  }));
  render(false, null);
  const T = globalThis.ucdpTable([{ id: 'israel', months }]);
  assert.deepEqual([...T.months], ['2026-10', '2026-09', '2026-08', '2026-07']);
  assert.equal(T.heat(0), 0);
  assert.ok(T.heat(40) > T.heat(10) && T.heat(40) <= 0.38);
});

test('unidentified UCDP actors are named in words', () => {
  const data = {
    ...ucdpView(raw),
    latest: [{ date: '2026-10-31', where: 'Manbij', sides: 'XXX652 — Civilians', deaths: 2 }],
  };
  assert.match(text(render(false, data)), /неустановленная сторона — Civilians/);
  assert.doesNotMatch(text(render(true, data)), /XXX652/);
});
