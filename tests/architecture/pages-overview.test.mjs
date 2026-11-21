import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleOverview, overviewFromD1 } from '../../backend/pages/src/api/overview.js';
const timestamp = 1794689958000;
const fixtureEvents = [
  {
    event_id: 'first',
    updated_at_ms: timestamp,
    payload: JSON.stringify({ title_ru: 'Заявление', summary_ru: 'Независимого подтверждения нет' }),
  },
  { event_id: 'second', updated_at_ms: timestamp - 2000, payload: 'not-json' },
];
const fixtureSources = [
  {
    source: 'adsb',
    attempted_at: timestamp,
    succeeded_at: timestamp,
    state: 'partial',
    detail: 'Coverage is limited',
  },
  { source: 'ais', attempted_at: timestamp, succeeded_at: timestamp, state: 'ok', detail: null },
  { source: 'centcom', attempted_at: timestamp, succeeded_at: null, state: 'retired', detail: 'obsolete' },
  { source: 'ioda', attempted_at: timestamp, succeeded_at: null, state: 'empty', detail: null },
];
test('normal response preserves all API fields and does not call empty data risk-free', () => {
  const v = assembleOverview({
    latestRun: { outcome: 'no_alert', recorded_at_ms: timestamp },
    eventRows: fixtureEvents,
    statusRows: fixtureSources,
    nowMs: timestamp,
  });
  assert.deepEqual(Object.keys(v), [
    'generatedAt',
    'analysis',
    'events',
    'sources',
    'tension',
    'available',
    'total',
  ]);
  assert.equal(v.analysis.state, 'normal');
  assert.equal(v.analysis.badge, 'БЕЗ НОВЫХ ПРЕДУПРЕЖДЕНИЙ');
  assert.equal(v.events[0].description, 'Независимого подтверждения нет');
  assert.equal(v.events[1].title, 'Событие');
  assert.equal(v.events[1].description, '');
  assert.equal(v.total, 3);
  assert.equal(v.available, 2);
  assert.equal(v.sources.find(x => x.id === 'adsb').label, 'ADS-B');
  assert.equal(v.sources.find(x => x.id === 'ioda').state, 'empty');
  assert.equal(v.sources.find(x => x.id === 'ais').description, '');
  assert.equal(v.generatedAt, new Date(timestamp).toISOString());
});
test('alert state requires attention, not a false all-clear', () => {
  const v = assembleOverview({
    latestRun: { outcome: 'alert', recorded_at_ms: timestamp },
    eventRows: fixtureEvents,
  });
  assert.equal(v.analysis.state, 'attention');
  assert.equal(v.analysis.badge, 'ТРЕБУЕТ ВНИМАНИЯ');
  assert.ok(v.analysis.description.includes('Не все сведения подтверждены'));
});
test('missing monitoring outcome never produces false reassurance', () => {
  const v = assembleOverview({
    latestRun: null,
    statusRows: [{ source: 'test', state: 'unknown', attempted_at: null }],
  });
  assert.equal(v.analysis.state, 'unknown');
  assert.equal(v.analysis.time, null);
  assert.equal(v.available, 0);
});
test('D1 read-only aggregator uses three production tables plus the tension index', async () => {
  const seen = [],
    db = {
      prepare(sql) {
        seen.push(sql);
        return { sql };
      },
      async batch(queries) {
        return [
          { results: [{ outcome: 'alert', recorded_at_ms: timestamp }] },
          { results: fixtureEvents },
          { results: fixtureSources },
        ];
      },
    };
  const v = await overviewFromD1({ DB: db }, timestamp);
  assert.equal(seen.length, 4);
  assert.deepEqual(
    seen.map(x => x.split(' FROM ')[1].split(' ')[0]),
    ['monitor_runs', 'monitor_events', 'source_status', 'tension_hours'],
  );
  assert.equal(v.tension, null, 'the mock has no tension row: null, not an error');
  assert.equal(v.analysis.state, 'attention');
  assert.equal(v.total, 3);
});
test('21.11: ?lang=he carries the analysis time and state only, no Russian events or labels', () => {
  const v = assembleOverview({
    latestRun: { outcome: 'alert', recorded_at_ms: timestamp },
    eventRows: fixtureEvents,
    statusRows: [{ source: 'adsb', state: 'ok', attempted_at: null }],
    lang: 'he',
  });
  assert.deepEqual(Object.keys(v.analysis).sort(), ['state', 'time']);
  assert.equal(v.analysis.state, 'attention');
  assert.deepEqual(v.events, []);
  assert.doesNotMatch(JSON.stringify(v), /[Ѐ-ӿ]/u, 'no Cyrillic in the HE overview');
});
test('tension index (21.11): codes and numbers only; a missing table gives null, not an error', async () => {
  const index = {
    hour_ms: timestamp,
    level: 3,
    calibrating: true,
    baseline_days: 11,
    regions: [
      {
        id: 'gulf',
        level: 3,
        families: ['air', 'news'],
        flagged: [{ indicator: 'mil_aircraft', family: 'air', value: 9, p95: 4, median: 2 }],
        coverage: { seen: 7, total: 9 },
      },
    ],
  };
  const v = assembleOverview({ latestRun: null, tension: index, lang: 'he' });
  assert.deepEqual(v.tension.regions[0], {
    id: 'gulf',
    level: 3,
    families: ['air', 'news'],
    signals: ['mil_aircraft'],
    coverage: { seen: 7, total: 9 },
  });
  assert.equal(v.tension.calibrating, true);
  assert.equal(assembleOverview({}).tension, null);
});
