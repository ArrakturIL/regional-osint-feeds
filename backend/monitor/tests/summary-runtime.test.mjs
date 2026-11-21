import test from 'node:test';
import assert from 'node:assert/strict';
import monitor from '../src/index.js';

// ARCH-06: migrate historical Worker summary/security contracts to the actual
// production Monitor entrypoint, not the archived worker/regional-osint-monitor.js.
// All database samples are isolated in-memory fixtures; never contact Cloudflare.
const AUTH = 'Bearer test-only-monitor-summary-secret';
const baseUrl = 'https://monitor.test';

function fakeSummaryDb({
  events = [],
  statuses = [],
  providers = [],
  aviation = [],
  corridors = [],
  quotas = [],
} = {}) {
  const traces = [];
  return {
    traces,
    prepare(sql) {
      return {
        sql,
        params: [],
        bind(...values) {
          this.params = values;
          return this;
        },
      };
    },
    async batch(statements) {
      traces.push(statements);
      assert.equal(statements.length, 6, 'summary uses six bounded database read queries');
      return [events, statuses, providers, aviation, corridors, quotas].map(results => ({ results }));
    },
  };
}
async function fetchSummary(db, path = '/summary?hours=1', options = {}) {
  const env = { DB: db, SUMMARY_TOKEN: 'test-only-monitor-summary-secret', ...options.env };
  const request = new Request(baseUrl + path, {
    method: options.method || 'GET',
    headers: options.headers === undefined ? { Authorization: AUTH } : options.headers,
  });
  const response = await monitor.fetch(request, env);
  const body = await response.json();
  return { response, body };
}
test('modern Monitor protects internal summary with an exact Bearer token before database access', async () => {
  const db = fakeSummaryDb();
  for (const headers of [
    {},
    { Authorization: 'Bearer wrong' },
    { Authorization: 'test-only-monitor-summary-secret' },
  ]) {
    const { response, body } = await fetchSummary(db, '/summary', { headers });
    assert.equal(response.status, 401);
    assert.equal(body.error, 'unauthorized');
  }
  const absentSecret = await fetchSummary(db, '/summary', { env: { SUMMARY_TOKEN: '' } });
  assert.equal(absentSecret.response.status, 401);
  assert.equal(db.traces.length, 0, 'no private D1 summary query on unauthorized requests');
});
test('unknown or non-GET summary routes do not reach private database', async () => {
  const db = fakeSummaryDb();
  assert.equal((await fetchSummary(db, '/not-found')).response.status, 404);
  assert.equal((await fetchSummary(db, '/summary', { method: 'POST' })).response.status, 404);
  assert.equal(db.traces.length, 0);
});
test('invalid summary time windows are rejected before database access', async () => {
  const db = fakeSummaryDb();
  for (const query of ['?hours=0', '?hours=25', '?hours=1.5', '?hours=NaN', '?hours=Infinity']) {
    const { response, body } = await fetchSummary(db, '/summary' + query);
    assert.equal(response.status, 400, query);
    assert.match(body.error, /hours/);
  }
  assert.equal(db.traces.length, 0);
});
test('modern summary preserves six bounded queries and source status without leaking private raw data', async () => {
  const db = fakeSummaryDb();
  const { response, body } = await fetchSummary(db);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(db.traces.length, 1);
  assert.equal(body.aviation_focus.length, 2);
  assert.equal(body.airbridge_context.regions.length, 6);
  assert.equal(body.airbridge_context.status, 'context_only_not_route_tracking');
  assert.equal(body.airbridge_context.planned_requests_per_day, 24);
  assert.equal(body.aviation_focus_comparison.confirmed_empty_airspace, false);
  assert.equal(body.sources.find(s => s.source === 'airbridge_context').interval_minutes, 60);
  assert.ok(body.sources.some(s => s.state === 'pending'));
  assert.ok(!JSON.stringify(body).includes('test-only-monitor-summary-secret'));
});
test('stale zero-count aircraft snapshot is never labeled as current empty airspace', async () => {
  const now = Date.now(),
    stale = now - 3 * 3600000;
  const db = fakeSummaryDb({
    statuses: [{ source: 'adsb_alt', state: 'partial', attempted_at: now, succeeded_at: stale }],
    aviation: [
      {
        source: 'adsb_alt',
        observed_at: stale,
        payload: JSON.stringify({ area: 'tehran', observed_aircraft: 0 }),
      },
    ],
  });
  const { body } = await fetchSummary(db);
  const sample = body.aviation_focus.find(s => s.source === 'adsb_alt');
  assert.equal(sample.status, 'no_recent_sample');
  assert.equal(sample.current_count, null);
  assert.equal(sample.last_sample_count, 0);
  assert.equal(body.aviation_focus_comparison.status, 'not_comparable');
});
test('failed ADS-B source is unavailable even if a previous aircraft sample is recent', async () => {
  const now = Date.now();
  const db = fakeSummaryDb({
    statuses: [{ source: 'adsb', state: 'error', attempted_at: now, succeeded_at: now - 60000 }],
    aviation: [
      {
        source: 'adsb',
        observed_at: now - 60000,
        payload: JSON.stringify({ area: 'tehran', observed_aircraft: 3 }),
      },
    ],
  });
  const { body } = await fetchSummary(db);
  const sample = body.aviation_focus.find(s => s.source === 'adsb');
  assert.equal(sample.status, 'source_unavailable');
  assert.equal(sample.current_count, null);
  assert.equal(sample.last_sample_count, 3);
});
test('near-simultaneous disagreeing provider counts remain unverified comparisons', async () => {
  const now = Date.now();
  const db = fakeSummaryDb({
    statuses: [
      { source: 'adsb', state: 'ok' },
      { source: 'adsb_alt', state: 'ok' },
    ],
    aviation: [
      {
        source: 'adsb',
        observed_at: now - 60000,
        payload: JSON.stringify({ area: 'tehran', observed_aircraft: 0 }),
      },
      {
        source: 'adsb_alt',
        observed_at: now - 3 * 60000,
        payload: JSON.stringify({ area: 'tehran', observed_aircraft: 4 }),
      },
    ],
  });
  const { body } = await fetchSummary(db);
  assert.equal(body.aviation_focus_comparison.status, 'source_disagreement');
  assert.equal(body.aviation_focus_comparison.confirmed_empty_airspace, false);
  assert.equal(body.aviation_focus_comparison.sample_gap_minutes, 2);
  assert.equal(body.aviation_focus.find(s => s.source === 'adsb').status, 'zero_in_sample');
  assert.equal(body.aviation_focus.find(s => s.source === 'adsb_alt').status, 'aircraft_observed');
});
