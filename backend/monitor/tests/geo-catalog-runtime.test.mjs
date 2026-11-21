import test from 'node:test';
import assert from 'node:assert/strict';
import { sentinelCatalog, aerialArchive, GEO_DAY } from '../src/collectors/satellite/catalog.js';

// Actual modular Monitor satellite collectors; all providers and D1 are local fixtures.
// Legacy worker/test-geo-catalog.mjs relied on a frozen, non-production Worker.
const HOUR = 3600000;
const sceneSlot = Math.floor(Date.now() / (3 * HOUR)) * (3 * HOUR);
const archiveSlot = Math.floor(Date.now() / GEO_DAY) * GEO_DAY;
function fixture({ cooldown = false } = {}) {
  const calls = { writes: [], fetches: [] };
  const db = {
    prepare(sql) {
      const stmt = {
        sql,
        params: [],
        bind(...args) {
          this.params = args;
          return this;
        },
        async first() {
          if (sql.startsWith('UPDATE worker_provider_state SET lease_until=?'))
            return cooldown ? null : { failures: 0 };
          if (sql.startsWith('SELECT next_allowed_at,lease_until,last_error FROM worker_provider_state'))
            return { next_allowed_at: Date.now() + 3600000, lease_until: 0, last_error: 'upstream HTTP 429' };
          throw Error('Unexpected D1 select: ' + sql);
        },
        async run() {
          calls.writes.push({ sql, params: this.params });
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return { env: { DB: db }, calls };
}
function sceneResponse(url, slot, { malformed = false } = {}) {
  const req = new URL(url),
    collection = req.searchParams.get('collections');
  const bbox = req.searchParams.get('bbox').split(',').map(Number);
  if (malformed) return Response.json({ type: 'FeatureCollection', features: [{ id: 'INVALID' }] });
  const id = 'SCENE_ABCDEF123456';
  const feature = {
    type: 'Feature',
    id,
    collection,
    bbox,
    links: [
      {
        rel: 'self',
        href: 'https://earth-search.aws.element84.com/v1/collections/' + collection + '/items/' + id,
      },
    ],
    properties: {
      datetime: new Date(slot - 24 * HOUR).toISOString(),
      platform: 'sentinel-2c',
      'eo:cloud_cover': 3.5,
      'sar:polarizations': ['VV', 'VH', 'BAD'],
    },
    assets: { thumbnail: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/example/preview.jpg' } },
  };
  return Response.json({ type: 'FeatureCollection', features: [feature] });
}
function archiveResponse(url, { empty = false } = {}) {
  const bbox = new URL(url).searchParams.get('bbox').split(',').map(Number);
  return Response.json({
    meta: { provided_by: 'OpenAerialMap', license: 'CC-BY 4.0' },
    results: empty
      ? []
      : [
          {
            _id: '59e62b863d6412ef72209ae1',
            bbox,
            gsd: 0.35,
            provider: 'Test provider',
            acquisition_start: '2024-12-09T21:00:00.000Z',
            title: 'Archived capture',
            meta_uri: 'https://api.openaerialmap.org/meta/59e62b863d6412ef72209ae1',
          },
        ],
  });
}
async function exercise(collector, slot, { response, cooldown = false } = {}) {
  const h = fixture({ cooldown }),
    old = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    h.calls.fetches.push({ url: String(url), options: opts });
    assert.equal(opts.redirect, 'manual', 'Cloudflare Workers require manual redirect handling');
    assert.equal(opts.headers.Accept, 'application/json');
    return response(url);
  };
  try {
    let data, error;
    try {
      data = await collector(h.env, slot);
    } catch (e) {
      error = e;
    }
    return { ...h, data, error };
  } finally {
    globalThis.fetch = old;
  }
}
test('modern Sentinel discovery uses a single bounded query and never treats scene metadata as an incident', async () => {
  const result = await exercise(sentinelCatalog, sceneSlot, {
    response: url => sceneResponse(url, sceneSlot),
  });
  assert.equal(result.error, undefined);
  assert.equal(result.calls.fetches.length, 1);
  const req = new URL(result.calls.fetches[0].url);
  assert.equal(req.hostname, 'earth-search.aws.element84.com');
  assert.equal(req.searchParams.get('sortby'), '-properties.datetime');
  assert.equal(req.searchParams.get('limit'), '8');
  const snapshot = result.data.entries[0].payload;
  assert.equal(result.data.entries.length, 1);
  assert.equal(snapshot.metadata_only, true);
  assert.equal(snapshot.source_type, 'open_satellite_scene_catalog');
  assert.equal(snapshot.cloud_cover_percent, 3.5);
  assert.deepEqual(snapshot.polarizations, ['VV', 'VH']);
  assert.ok(snapshot.item_url.startsWith('https://earth-search.aws.element84.com/v1/collections/'));
  assert.ok(!('aircraft' in snapshot) && !('incident_confirmed' in snapshot));
});
test('modern OpenAerialMap archives the historical acquisition date as metadata only', async () => {
  const result = await exercise(aerialArchive, archiveSlot, { response: url => archiveResponse(url) });
  assert.equal(result.error, undefined);
  assert.equal(result.calls.fetches.length, 1);
  assert.equal(new URL(result.calls.fetches[0].url).hostname, 'api.openaerialmap.org');
  assert.equal(result.data.entries.length, 1);
  const snap = result.data.entries[0].payload;
  assert.equal(snap.acquired_at, '2024-12-09T21:00:00.000Z');
  assert.equal(snap.archive_only, true);
  assert.equal(snap.metadata_only, true);
  assert.equal(snap.source_type, 'open_aerial_imagery_archive');
  assert.equal(snap.ground_sample_distance_m, 0.35);
});
test('genuinely empty OpenAerialMap results are a successful empty catalogue, not an error', async () => {
  const result = await exercise(aerialArchive, archiveSlot, {
    response: url => archiveResponse(url, { empty: true }),
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.data.entries, []);
  assert.deepEqual(result.data.missing, []);
});
test('non-empty malformed Sentinel catalogue is rejected, never downgraded to zero scenes', async () => {
  const result = await exercise(sentinelCatalog, sceneSlot, {
    response: url => sceneResponse(url, sceneSlot, { malformed: true }),
  });
  assert.match(result.error?.message || '', /unexpected Earth Search scene metadata/);
  assert.equal(result.data, undefined);
});
test('Sentinel HTTP 429 persists six-hour provider backoff instead of fabricating an empty result', async () => {
  const before = Date.now();
  const result = await exercise(sentinelCatalog, sceneSlot, {
    response: () => new Response('slow down', { status: 429, headers: { 'Retry-After': '7200' } }),
  });
  assert.match(result.error?.message || '', /upstream HTTP 429/);
  assert.equal(result.calls.fetches.length, 1);
  const backoff = result.calls.writes.find(
    x => x.sql.includes('last_status=?') && x.sql.includes('last_error=?'),
  );
  assert.ok(backoff, 'provider error must write persistent provider cooldown');
  assert.equal(backoff.params[2], 429);
  assert.ok(backoff.params[0] >= before + 6 * HOUR);
});
test('catalogue cooldown blocks HTTP, rather than silently reporting an empty success', async () => {
  const result = await exercise(sentinelCatalog, sceneSlot, {
    cooldown: true,
    response: () => {
      throw Error('must not fetch');
    },
  });
  assert.equal(result.calls.fetches.length, 0);
  assert.match(result.error?.message || '', /paused until/);
  assert.equal(result.data, undefined);
});
