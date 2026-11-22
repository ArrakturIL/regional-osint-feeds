// Tension index block (owner 21.11): every code the Editor can send has a RU
// and a HE label; no block without data; the demo note while calibrating.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { INDICATORS, REGIONS } from '../../backend/editor/src/tension/indicators.mjs';

const src = readFileSync(new URL('../src/components/Tension/Tension.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm, '')
  .replace(/^export /gm, '');
const render = he => {
  const ctx = {
    UI_HE: he,
    fmtTime: () => '21:00',
    h: (tag, props, ...children) => ({ tag, props, children: children.flat() }),
    t: (tag, cls, content) => ({ tag, props: { className: cls }, children: [content] }),
  };
  vm.runInNewContext(
    src +
      '\nthis.Tension = Tension; this.L = TENSION_L; this.tensionReason = tensionReason; this.tensionReasons = tensionReasons; this.TensionDetail = TensionDetail;',
    ctx,
  );
  return ctx;
};
const text = node =>
  node == null || node === false
    ? ''
    : typeof node !== 'object'
      ? String(node)
      : (node.children || []).map(text).join(' ');

test('labels exist in RU and HE for every region and signal code', () => {
  const { L } = render(false);
  for (const lang of ['ru', 'he']) {
    for (const r of REGIONS) assert.ok(L[lang].regions[r], lang + ' region ' + r);
    for (const i of INDICATORS) assert.ok(L[lang].signals[i.id], lang + ' signal ' + i.id);
    assert.equal(L[lang].level.length, 6);
    for (const i of INDICATORS) assert.ok(L[lang].families[i.family], lang + ' family ' + i.family);
  }
});

test('no tension, no block; calibrating shows the demo badge and the note with days', () => {
  assert.equal(render(false).Tension({ tension: null }), null);
  const tension = {
    as_of: '2026-11-21T19:00:00Z',
    level: 3,
    calibrating: true,
    baseline_days: 11,
    regions: [
      {
        id: 'gulf',
        level: 3,
        families: ['air', 'news'],
        signals: ['mil_aircraft', 'urgent_news'],
        details: [
          { indicator: 'mil_aircraft', value: 14, p95: 6, median: 3 },
          { indicator: 'urgent_news', value: 5, p95: 2.4, median: 1 },
        ],
        coverage: { seen: 9, total: 10 },
      },
      { id: 'iran', level: 1, families: [], signals: [], coverage: { seen: 9, total: 9 } },
    ],
  };
  const ru = text(render(false).Tension({ tension }));
  assert.match(ru, /демо/);
  assert.match(ru, /по 11 дн\. из 30/);
  assert.match(ru, /Необычная активность/);
  assert.match(ru, /два независимых отклонения/);
  assert.match(ru, /военные борта: 14 · обычно не больше 6/);
  assert.match(ru, /срочные новости: 5 · обычно не больше 2\.4/);
  assert.match(ru, /Иран\s+как обычно/);
  assert.match(ru, /нет данных по 1 сигн\./);
  const he = text(render(true).Tension({ tension }));
  assert.doesNotMatch(he, /[Ѐ-ӿ]/u, 'no Cyrillic on the HE page');
  assert.match(he, /הדגמה/);
});

test('rule signals show the count without a norm; lit families match the region', () => {
  const ctx = render(false);
  assert.equal(
    ctx.tensionReason({ indicator: 'official_notice', value: 3, rule: 1 }, ctx.L.ru),
    'официальные предупреждения: 3',
  );
  const tree = ctx.Tension({
    tension: {
      as_of: 'x',
      calibrating: false,
      regions: [
        {
          id: 'gulf',
          level: 2,
          families: ['official'],
          signals: ['official_notice'],
          details: [{ indicator: 'official_notice', value: 2, rule: 1 }],
        },
      ],
    },
  });
  const find = (n, cls) =>
    n && typeof n === 'object'
      ? n.props?.className === cls
        ? [n]
        : (n.children || []).flatMap(c => find(c, cls))
      : [];
  const card = find(tree, 'rw-tension-fam rw-tension-fam-sm')[0];
  assert.deepEqual(
    find(card, 'on')
      .map(text)
      .map(x => x.trim()),
    ['официальные'],
  );
  assert.deepEqual(
    ctx.tensionReasons(
      {
        indicator: 'official_notice',
        value: 2,
        rule: 1,
        refs: [{ source: 'fcdo', at: '2026-11-18T10:00:00Z' }],
      },
      ctx.L.ru,
    ),
    ['МИД Великобритании обновил рекомендации для поездок — 18.11'],
  );
  assert.deepEqual(
    ctx.tensionReasons(
      {
        indicator: 'official_notice',
        value: 4,
        rule: 1,
        refs: [
          { source: 'fcdo', at: '2026-11-18T10:00:00Z', n: 3 },
          { source: 'state_dept', at: '2026-11-17T10:00:00Z', n: 1 },
        ],
      },
      ctx.L.ru,
    ),
    [
      'МИД Великобритании обновил рекомендации для поездок (3 обновл.) — 18.11',
      'Госдеп США обновил предупреждение для поездок — 17.11',
    ],
  );
});

test('the Data page detail renders in RU and HE (22.11: a removed label crashed «Данные»)', () => {
  const tension = {
    as_of: 'x',
    calibrating: true,
    baseline_days: 9,
    regions: [
      {
        id: 'gulf',
        level: 2,
        families: ['official'],
        signals: ['official_notice'],
        details: [{ indicator: 'official_notice', value: 2, rule: 1 }],
        coverage: { seen: 9, total: 10 },
      },
      { id: 'iran', level: 1, families: [], signals: [], details: [], coverage: { seen: 9, total: 9 } },
    ],
  };
  for (const he of [false, true]) assert.ok(text(render(he).TensionDetail({ tension })).length > 50);
  assert.ok(render(false).TensionDetail({ tension: null }));
});

test('official notices name the countries (22.11)', () => {
  const ctx = render(false);
  assert.deepEqual(
    ctx.tensionReasons(
      {
        indicator: 'official_notice',
        value: 2,
        rule: 1,
        refs: [{ source: 'fcdo', at: '2026-11-19T01:00:00Z', n: 2, places: ['bahrain', 'qatar'] }],
      },
      ctx.L.ru,
    ),
    ['МИД Великобритании обновил рекомендации для поездок: Бахрейн, Катар — 19.11'],
  );
});
