// Tension index (owner 21.11): hourly indicators from Monitor observations,
// a 14-day norm, a 1–5 level counted by independent families.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY,
  HOUR,
  firmsRegion,
  hourIndex,
  hourValues,
  textRegions,
  MIN_BASELINE_HOURS,
} from '../../backend/editor/src/tension/indicators.mjs';
import { tensionTick } from '../../backend/editor/src/tension/tick.mjs';
import { coreDb, newsDb } from './editor-d1-fixture.mjs';

const H = Date.parse('2026-11-21T18:00:00Z');
const row = (observed_at, payload) => ({ observed_at, payload: JSON.stringify(payload) });
const mil = (at, areas) => row(at, { areas });
const none = () => 'normal';

test('air: military aircraft are a union of ids over 6 h; tankers and airlift by type', () => {
  const data = {
    obs: {
      mil_lol: [
        mil(H - 5 * HOUR, { persian_gulf: { aircraft_ids: ['a', 'b'], types: { K35R: 1, B748: 1 } } }),
        mil(H - HOUR, { persian_gulf: { aircraft_ids: ['b', 'c'], types: { C17: 1, K35R: 1 } } }),
        mil(H - 7 * HOUR, { persian_gulf: { aircraft_ids: ['old'], types: { K35R: 9 } } }),
      ],
    },
    news: [],
  };
  const v = hourValues(H, data, none);
  assert.deepEqual(v.get('gulf:mil_aircraft'), { value: 3, has_data: 1 });
  assert.equal(v.get('gulf:mil_tanker_airlift').value, 2);
  assert.equal(v.get('red_sea:mil_aircraft').value, 0);
});

test('regions: FIRMS cells and free text map to regions in three languages', () => {
  assert.equal(firmsRegion(33, 44), 'iraq');
  assert.equal(firmsRegion(35, 51), 'iran');
  assert.equal(firmsRegion(26, 49), 'gulf');
  assert.equal(firmsRegion(24, 54), 'gulf');
  assert.deepEqual(textRegions('Airspace of the Persian Gulf and Gulf of Oman'), ['gulf']);
  assert.deepEqual(textRegions('Удар по Ирану'), ['iran']);
  assert.deepEqual(textRegions('תקיפה בתימן'), ['red_sea']);
});

test('official: the first import of a source is history; a later revision is a notice', () => {
  const first = H - 5 * DAY;
  const data = {
    obs: {
      fcdo: [
        row(first, { country: 'iran', title: 'Iran travel advice' }),
        row(H - 2 * HOUR, { country: 'israel', title: 'Israel travel advice' }),
      ],
    },
    news: [],
    firstSeen: { fcdo: first },
  };
  const v = hourValues(H, data, none);
  assert.equal(v.get('israel:official_notice').value, 1);
  assert.equal(v.get('iran:official_notice').value, 0);
  assert.deepEqual(v.get('israel:official_notice').refs, [{ source: 'fcdo', at: H - 2 * HOUR, n: 1, places: ['israel'] }]);
  assert.equal(v.get('iran:official_notice').refs, undefined);
});

test('cyber, ground and news: outage start, FIRMS by day, urgent headlines by region', () => {
  const day = new Date(H - 1).toISOString().slice(0, 10);
  const data = {
    obs: {
      ioda: [row(H - 3 * HOUR, { area: 'IR', start: (H - 4 * HOUR) / 1000, severity: 500 })],
      firms: [
        row(H - HOUR, {
          counts_by_day_and_degree: { [day + '/35/51']: 40, [day + '/33/44']: 7, '2020-01-01/35/51': 99 },
        }),
      ],
    },
    news: [
      { headline: 'Explosions reported in Tehran', published_ms: H - HOUR },
      { headline: 'Explosions in Tehran again', published_ms: H - 2 * HOUR },
      { headline: 'Weather in Haifa', published_ms: H - HOUR },
    ],
  };
  const v = hourValues(H, data, n => (/Explosions/.test(n.headline) ? 'urgent' : 'normal'));
  assert.equal(v.get('iran:internet_outage').value, 1);
  assert.equal(v.get('iraq:internet_outage').value, 0);
  assert.equal(v.get('iran:firms_hotspots').value, 40);
  assert.equal(v.get('iraq:firms_hotspots').value, 7);
  assert.equal(v.get('iran:urgent_news').value, 2);
  assert.equal(v.get('israel:urgent_news').value, 0);
});

test('index: a norm indicator flags only above its p95, its floor and 1.5× median, after 3 days', () => {
  const values = new Map([
    ['gulf:mil_aircraft', { value: 9, has_data: 1 }],
    ['gulf:urgent_news', { value: 2, has_data: 1 }],
  ]);
  const calm = Array.from({ length: MIN_BASELINE_HOURS }, (_, i) => i % 4); // 0..3
  const history = new Map([
    ['gulf:mil_aircraft', calm],
    ['gulf:urgent_news', calm],
  ]);
  const gulf = hourIndex(H, values, history, 10).regions.find(r => r.id === 'gulf');
  assert.deepEqual(
    gulf.flagged.map(f => f.indicator),
    ['mil_aircraft'],
    'news 2 is under its floor 3',
  );
  assert.equal(gulf.level, 2);
  const young = hourIndex(H, values, new Map([['gulf:mil_aircraft', calm.slice(0, 10)]]), 0);
  assert.equal(young.regions.find(r => r.id === 'gulf').level, 1, 'no flags while the norm is being learnt');
  assert.equal(young.calibrating, true);
});

test('index: the level counts families, not indicators; official at three families gives 5', () => {
  const calm = Array.from({ length: 100 }, () => 0);
  const hist = new Map(
    ['mil_aircraft', 'mil_tanker_airlift', 'urgent_news', 'firms_hotspots', 'gdelt_conflict'].map(i => [
      'iran:' + i,
      calm,
    ]),
  );
  const v = pairs => new Map(pairs.map(([k, value]) => ['iran:' + k, { value, has_data: 1 }]));
  const level = pairs => hourIndex(H, v(pairs), hist, 20).regions.find(r => r.id === 'iran').level;
  assert.equal(
    level([
      ['mil_aircraft', 9],
      ['mil_tanker_airlift', 9],
    ]),
    2,
    'two air indicators are one family',
  );
  assert.equal(
    level([
      ['mil_aircraft', 9],
      ['urgent_news', 9],
    ]),
    3,
  );
  assert.equal(
    level([
      ['mil_aircraft', 9],
      ['urgent_news', 9],
      ['firms_hotspots', 90],
    ]),
    4,
  );
  assert.equal(
    level([
      ['mil_aircraft', 9],
      ['urgent_news', 9],
      ['official_notice', 1],
    ]),
    5,
  );
  assert.equal(
    level([
      ['mil_aircraft', 9],
      ['urgent_news', 9],
      ['firms_hotspots', 90],
      ['official_notice', 1],
    ]),
    5,
  );
  const r = hourIndex(H, v([['mil_aircraft', 1]]), hist, 20).regions.find(x => x.id === 'iran');
  assert.ok(
    r.coverage.seen >= 1 && r.coverage.total > r.coverage.seen,
    'coverage counts indicators with data',
  );
});

test('tick: back-fills from the first observation a few hours per tick, then stays up to date', async () => {
  const core = coreDb();
  core.raw.exec(
    'CREATE TABLE observations(source TEXT NOT NULL,id TEXT NOT NULL,revision TEXT NOT NULL,observed_at INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(source,id,revision))',
  );
  const news = newsDb();
  const start = H - 3 * DAY;
  for (let t = start; t < H; t += HOUR)
    core.raw
      .prepare('INSERT INTO observations VALUES(?,?,?,?,?)')
      .run(
        'mil_lol',
        'x',
        String(t),
        t,
        JSON.stringify({ areas: { red_sea: { aircraft_ids: [String(t % 3)], types: {} } } }),
      );
  const env = { CORE_DB: core, NEWS_DB: news };
  const first = await tensionTick(env, H + 5 * 60000);
  assert.equal(first.computed, 12);
  assert.equal(core.one('SELECT min(hour_ms) h FROM tension_hours').h, start + DAY);
  let ticks = 1;
  while ((await tensionTick(env, H + 5 * 60000)).computed) ticks++;
  assert.equal(core.one('SELECT max(hour_ms) h FROM tension_hours').h, H);
  assert.equal(core.one('SELECT count(*) n FROM tension_hours').n, 49);
  assert.equal(ticks, 5);
  assert.equal((await tensionTick(env, H + 10 * 60000)).state, 'up_to_date');
  const last = JSON.parse(core.one('SELECT index_json j FROM tension_hours WHERE hour_ms=?', H).j);
  assert.equal(last.regions.length, 6);
  assert.equal(last.regions.find(r => r.id === 'red_sea').coverage.seen >= 1, true);
  assert.equal(last.calibrating, true);
});

test('regions (22.11): Israel apart from Lebanon and Syria', () => {
  assert.deepEqual(textRegions('IDF strikes in Gaza'), ['israel']);
  assert.deepEqual(textRegions('Hezbollah fires from Lebanon'), ['lebanon_syria']);
  assert.deepEqual(textRegions('Israel strikes Hezbollah in Beirut'), ['israel', 'lebanon_syria']);
});
