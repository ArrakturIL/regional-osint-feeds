import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  readCollectorPair,
  readD1CollectorSnapshot,
} from '../../backend/monitor/src/mirrors/collector-cache.js';
import { gdeltContext } from '../../backend/monitor/src/collectors/media/gdelt.js';
import { maradAdvisories } from '../../backend/monitor/src/collectors/maritime/marad.js';
import { centcomDvids } from '../../backend/monitor/src/collectors/official/centcom-dvids.js';
import { satelliteContext } from '../../backend/monitor/src/collectors/satellite/github.js';
import { copernicusAnalysis } from '../../backend/monitor/src/collectors/satellite/copernicus.js';
import { unosatAnalysis } from '../../backend/monitor/src/collectors/satellite/unosat.js';

const at = Date.parse('2026-11-15T12:00:00Z');
const data = { source: 'gdelt_context', latest_batch: '20261115120000', sample: [] };
const status = { source: 'gdelt_context', state: 'ok', checked_at: new Date(at).toISOString() };
const canonical = x =>
  JSON.stringify(
    x && typeof x === 'object'
      ? Array.isArray(x)
        ? x.map(y => JSON.parse(canonical(y)))
        : Object.fromEntries(
            Object.keys(x)
              .sort()
              .map(k => [k, JSON.parse(canonical(x[k]))]),
          )
      : x,
  );
const hash = x => createHash('sha256').update(canonical(x), 'utf8').digest('hex');
const row = () => ({
  source_key: 'gdelt',
  data_json: JSON.stringify(data),
  status_json: JSON.stringify(status),
  checked_at_ms: at,
  data_sha256: hash(data),
  status_sha256: hash(status),
});
function fixtureEnv(stored, enabled = 'gdelt') {
  const calls = { sql: [], sources: [], requests: [] };
  const db = {
    prepare(sql) {
      calls.sql.push(sql);
      return {
        bind(key) {
          calls.sources.push(key);
          return { first: async () => stored };
        },
      };
    },
  };
  return { env: { DB: db, COLLECTOR_CACHE_SOURCES: enabled }, calls };
}
function fetcher(calls) {
  return async url => {
    calls.requests.push(url);
    return url.endsWith('-status.json') ? status : data;
  };
}
const dataUrl =
  'https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/gdelt-context.json';
const statusUrl =
  'https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/gdelt-status.json';
const read = (env, get, options = {}) =>
  readCollectorPair(env, 'gdelt', dataUrl, statusUrl, { get, nowMs: at + 60000, ...options });

test('flag off reads legacy GitHub pair and does not query D1', async () => {
  const { env, calls } = fixtureEnv(row(), '');
  const result = await read(env, fetcher(calls));
  assert.equal(result.origin, 'github');
  assert.equal(calls.sql.length, 0);
  assert.equal(calls.requests.length, 2);
  assert.deepEqual(result.data, data);
  assert.deepEqual(result.status, status);
});

test('enabled valid cached Neon row returns intact pair with no GitHub requests', async () => {
  const { env, calls } = fixtureEnv(row());
  const result = await read(env, fetcher(calls));
  assert.equal(result.origin, 'neon_d1_cache');
  assert.deepEqual(result.data, data);
  assert.deepEqual(result.status, status);
  assert.deepEqual(calls.sources, ['gdelt']);
  assert.deepEqual(calls.requests, []);
});

test('modified D1 JSON with unchanged digest fails closed to legacy', async () => {
  const corrupt = { ...row(), data_json: JSON.stringify({ ...data, sample: ['fabricated'] }) };
  const { env, calls } = fixtureEnv(corrupt);
  const result = await read(env, fetcher(calls));
  assert.equal(result.origin, 'github');
  assert.equal(calls.requests.length, 2);
});

test('status timestamp mismatch fails closed to legacy', async () => {
  const inconsistent = { ...row(), checked_at_ms: at - 3600000 };
  const { env, calls } = fixtureEnv(inconsistent);
  const result = await read(env, fetcher(calls));
  assert.equal(result.origin, 'github');
  assert.equal(calls.requests.length, 2);
});

test('missing row, missing DB, or D1 error falls back without presenting no activity', async () => {
  for (const dbRow of [null, { ...row(), data_json: 'not json' }]) {
    const { env, calls } = fixtureEnv(dbRow);
    const res = await read(env, fetcher(calls));
    assert.equal(res.origin, 'github');
    assert.equal(calls.requests.length, 2);
  }
  const calls = { requests: [] };
  const noDb = { COLLECTOR_CACHE_SOURCES: 'gdelt' };
  assert.equal((await read(noDb, fetcher(calls))).origin, 'github');
  assert.equal(calls.requests.length, 2);
});

test('enabled cache fallback reports a sanitized reason, but disabled mirror never reports a fallback', async () => {
  const notes = [];
  const capture = diagnostic => notes.push(diagnostic);
  const { env, calls } = fixtureEnv(null);
  const missing = await read(env, fetcher(calls), { onFallback: capture });
  assert.equal(missing.origin, 'github');
  assert.deepEqual(notes, [{ source: 'gdelt', reason: 'cache_missing' }]);
  const bad = { ...row(), data_sha256: '0'.repeat(64) };
  const broken = fixtureEnv(bad);
  await read(broken.env, fetcher(broken.calls), { onFallback: capture });
  assert.deepEqual(notes[1], { source: 'gdelt', reason: 'cache_invalid' });
  const late = fixtureEnv(row());
  await read(late.env, fetcher(late.calls), {
    onFallback: capture,
    nowMs: at + 12 * 3600000,
    maxAgeMs: 4 * 3600000,
  });
  assert.deepEqual(notes[2], { source: 'gdelt', reason: 'cache_stale' });
  const off = fixtureEnv(row(), '');
  await read(off.env, fetcher(off.calls), { onFallback: capture });
  assert.equal(notes.length, 3);
  assert.equal(JSON.stringify(notes).includes('https:'), false, 'do not reveal source URLs or credentials');
});

test('production fallback warning is source-only and rate-limited within one isolate', async () => {
  const warnings = [],
    old = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const { env, calls } = fixtureEnv(null, 'unosat');
    const args = [env, 'unosat', dataUrl, statusUrl, { get: fetcher(calls), nowMs: at + 60000 }];
    assert.equal((await readCollectorPair(...args)).origin, 'github');
    assert.equal((await readCollectorPair(...args)).origin, 'github');
    assert.deepEqual(warnings, ['regional_watch reader_fallback source=unosat reason=cache_missing']);
    assert.ok(!warnings.join('').includes('https://'));
  } finally {
    console.warn = old;
  }
});

test('stale D1 row falls back to fresh legacy, never masquerades as current', async () => {
  const { env, calls } = fixtureEnv(row());
  const result = await read(env, fetcher(calls), { nowMs: at + 7 * 3600000, maxAgeMs: 4 * 3600000 });
  assert.equal(result.origin, 'github');
  assert.equal(calls.requests.length, 2);
});

test('stored error status is retained, never converted into an empty healthy snapshot', async () => {
  const badStatus = { ...status, state: 'error' };
  const r = { ...row(), status_json: JSON.stringify(badStatus), status_sha256: hash(badStatus) };
  const { env, calls } = fixtureEnv(r);
  const res = await read(env, fetcher(calls));
  assert.equal(res.origin, 'neon_d1_cache');
  assert.equal(res.status.state, 'error');
});

test('invalid source keys never reach SQL and invalid hashes are rejected', async () => {
  const { env, calls } = fixtureEnv(row());
  await assert.rejects(
    readCollectorPair(env, '../../keys', dataUrl, statusUrl, { get: fetcher(calls) }),
    /unknown collector/,
  );
  assert.equal(calls.sql.length, 0);
  const r = { ...row(), data_sha256: '0'.repeat(64) };
  await assert.rejects(
    readD1CollectorSnapshot(
      { ...env, DB: { prepare: () => ({ bind: () => ({ first: async () => r }) }) } },
      'gdelt',
    ),
    /digest/i,
  );
});

test('D1 lookup does not require a Neon connection string in Cloudflare Worker', async () => {
  const { env, calls } = fixtureEnv(row());
  assert.equal(env.NEON_DATABASE_URL, undefined);
  assert.deepEqual((await readD1CollectorSnapshot(env, 'gdelt')).data, data);
  assert.equal(calls.sql.length, 1);
});

test('actual Monitor GDELT collector reads D1 cache when source flag enables Neon mirror', async () => {
  const snapshot = {
    ...data,
    created_at: status.checked_at,
    batches: [data.latest_batch],
    coded_rows_total: 2,
    coded_rows_matched: 1,
    by_action_country: { IR: 1 },
    by_event_root: { 18: 1 },
    distinct_publisher_domains: 1,
  };
  const stored = { ...row(), data_json: JSON.stringify(snapshot), data_sha256: hash(snapshot) };
  const { env, calls } = fixtureEnv(stored);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error('GDELT must not fetch GitHub while D1 cache is healthy');
  };
  try {
    const result = await gdeltContext(env, at + 60000);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].payload.source_type, 'machine_coded_news_context');
    assert.equal(calls.sql.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('other mirrored Monitor collectors use validated D1 snapshots without requesting GitHub', async () => {
  const stamp = new Date(at).toISOString();
  const samples = [
    [
      'marad',
      maradAdvisories,
      {
        source: 'marad_advisories',
        items: [
          {
            url: 'https://www.maritime.dot.gov/msci/2026-001',
            title: 'Official safety advisory',
            advisory_id: '2026-001',
            status: 'active',
          },
        ],
      },
      { source: 'marad_advisories', state: 'ok', checked_at: stamp },
    ],
    [
      'centcom',
      centcomDvids,
      {
        source: 'centcom_dvids',
        source_feed: 'https://www.dvidshub.net/rss/unit/72',
        items: [
          {
            url: 'https://www.dvidshub.net/news/123456',
            title: 'Public affairs release',
            published_at: stamp,
          },
        ],
        count: 1,
      },
      {
        source: 'centcom_dvids',
        source_feed: 'https://www.dvidshub.net/rss/unit/72',
        state: 'ok',
        checked_at: stamp,
      },
    ],
    [
      'satellite',
      satelliteContext,
      { source: 'satellite_context', visual_overviews: [], natural_events: [] },
      { source: 'satellite_context', state: 'ok', checked_at: stamp },
    ],
    [
      'copernicus',
      copernicusAnalysis,
      { source: 'copernicus_ems', schema_version: 1, checked_at: stamp, products: [] },
      { source: 'copernicus_ems', state: 'ok', checked_at: stamp },
    ],
    [
      'unosat',
      unosatAnalysis,
      { source: 'unosat_analysis', schema_version: 1, checked_at: stamp, products: [] },
      { source: 'unosat_analysis', state: 'ok', checked_at: stamp },
    ],
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error('cache-backed collector must not make GitHub requests');
  };
  try {
    for (const [source, collector, d, s] of samples) {
      const stored = {
        source_key: source,
        checked_at_ms: at,
        data_json: JSON.stringify(d),
        status_json: JSON.stringify(s),
        data_sha256: hash(d),
        status_sha256: hash(s),
      };
      const { env, calls } = fixtureEnv(stored, source);
      const result = await collector(env, at + 60000);
      assert.ok(result && Array.isArray(result.entries), source);
      assert.equal(calls.sql.length, 1, source);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Q12: ADS-B is collected on GitHub (Python) and read by the Monitor (JS).
// The sampled regions and the allowed cache keys must agree everywhere.
import { readFileSync as readQ12 } from 'node:fs';
import { MIRROR_SOURCES } from '../../backend/monitor/src/mirrors/collector-cache.js';
import { DEFAULT_REGION } from '../../backend/monitor/src/config/constants.js';
import { airSamplingRegions } from '../../backend/monitor/src/collectors/aviation/regions.js';
test('Q12: GitHub ADS-B collector samples exactly the Monitor focus and context regions', () => {
  const cfg = JSON.parse(readQ12(new URL('../../config/adsb-collector.json', import.meta.url), 'utf8'));
  const { focus, context } = airSamplingRegions({});
  assert.deepEqual(cfg.point.regions, [focus, ...context]);
  assert.deepEqual(cfg.point.regions[0], DEFAULT_REGION.air_focus);
  assert.equal(cfg.point.source_key, 'adsb');
  assert.equal(cfg.mil.source_key, 'adsb_mil');
});
test('Q12: cache source keys agree in Monitor, Python mirror and both schemas', () => {
  const keys = [...MIRROR_SOURCES].sort();
  assert.ok(keys.includes('adsb') && keys.includes('adsb_mil'));
  const py = readQ12(new URL('../../scripts/neon_mirror.py', import.meta.url), 'utf8');
  const pyKeys = [...py.matchAll(/^\s+"([a-z_]+)": \(/gm)].map(m => m[1]).sort();
  assert.deepEqual(pyKeys, keys);
  for (const sql of [
    'storage/neon/001_collector_snapshots.sql',
    'storage/cloudflare/001_regional_collector_cache.sql',
    'storage/neon/002_collector_snapshots_adsb.sql',
    'storage/cloudflare/006_collector_cache_adsb.sql',
  ]) {
    const text = readQ12(new URL('../../' + sql, import.meta.url), 'utf8');
    const list = text.match(/source_key IN \(([^)]*)\)/)[1];
    assert.deepEqual([...list.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort(), keys, sql);
  }
});
