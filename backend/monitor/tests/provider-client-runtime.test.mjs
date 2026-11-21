import test from 'node:test';
import assert from 'node:assert/strict';
import { providerGet } from '../src/network/provider-client.js';

function fixture({ failures = 0, nextAllowed = 0, leaseUntil = 0, claimed = true } = {}) {
  const state = { failures, next_allowed_at: nextAllowed, lease_until: leaseUntil, last_error: null };
  const writes = [],
    reads = [];
  const db = {
    prepare(sql) {
      return {
        sql,
        params: [],
        bind(...args) {
          this.params = args;
          return this;
        },
        async run() {
          writes.push({ sql, params: this.params });
          return { meta: { changes: 1 } };
        },
        async first() {
          reads.push({ sql, params: this.params });
          if (sql.startsWith('UPDATE worker_provider_state SET lease_until=?'))
            return claimed ? { ...state, lease_until: Date.now() + 30000 } : null;
          if (sql.startsWith('SELECT * FROM worker_provider_state')) return state;
          throw Error('Unknown D1 read: ' + sql);
        },
      };
    },
  };
  return { db, writes, reads };
}
async function simulated({ response, provider = 'adsb.lol', state = {} }) {
  const f = fixture(state);
  const original = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls++;
    return response();
  };
  try {
    let value, error;
    try {
      value = await providerGet({ DB: f.db }, provider, 'https://example.test/point');
    } catch (caught) {
      error = caught;
    }
    return { ...f, value, error, networkCalls };
  } finally {
    globalThis.fetch = original;
  }
}
function snapshot(headers = {}) {
  return Response.json({ now: Math.floor(Date.now() / 1000), ac: [] }, { headers });
}
test('429 Retry-After respects provider cooldown and persists failure without replaying traffic', async () => {
  const before = Date.now();
  const out = await simulated({
    response: () => new Response('', { status: 429, headers: { 'Retry-After': '900' } }),
  });
  assert.equal(out.networkCalls, 1);
  assert.match(out.error?.message || '', /upstream HTTP 429/);
  const write = out.writes.find(x => x.sql.includes('next_allowed_at=?') && x.sql.includes('last_error=?'));
  assert.ok(write, 'provider backoff must persist to D1');
  assert.equal(write.params[1], 1, 'first failure increments count');
  assert.equal(write.params[2], 429);
  assert.ok(write.params[0] >= before + 900_000, 'Retry-After 900 seconds is not ignored');
});
test('403 pauses provider for at least six hours and does not report success', async () => {
  const before = Date.now();
  const out = await simulated({ response: () => new Response('', { status: 403 }) });
  assert.match(out.error?.message || '', /upstream HTTP 403/);
  const write = out.writes.find(x => x.sql.includes('next_allowed_at=?') && x.sql.includes('last_error=?'));
  assert.ok(write.params[0] >= before + 6 * 3_600_000);
  assert.equal(write.params[2], 403);
  assert.ok(!out.writes.some(x => x.sql.includes('last_status=200')));
});
test('an unexpired persistent lease blocks even if caller attempts another provider query', async () => {
  const out = await simulated({
    state: { claimed: false, leaseUntil: Date.now() + 60000 },
    response: () => {
      throw Error('Must never fetch while provider lease is held');
    },
  });
  assert.equal(out.networkCalls, 0);
  assert.match(out.error?.message || '', /paused until|request in progress/);
});
test('stale success HTTP body is rejected and counted as an upstream failure', async () => {
  const out = await simulated({
    response: () => Response.json({ now: Math.floor((Date.now() - 6 * 60_000) / 1000), ac: [] }),
  });
  assert.equal(out.networkCalls, 1);
  assert.match(out.error?.message || '', /unexpected stale ADS-B response/);
  assert.ok(out.writes.some(x => x.sql.includes('last_error=?')));
  assert.ok(!out.writes.some(x => x.sql.includes('last_status=200')));
});
test('AvioADSB quota response headers update D1 before returning the snapshot', async () => {
  const out = await simulated({
    provider: 'avioadsb.org',
    response: () =>
      snapshot({
        'X-RateLimit-Remaining': '7',
        'X-RateLimit-Reset': '120',
      }),
  });
  assert.equal(out.networkCalls, 1);
  assert.ok(out.value?.ac && Array.isArray(out.value.ac));
  const quota = out.writes.find(x => x.sql.includes('worker_provider_quota'));
  assert.ok(quota, 'shared quota header must be stored for downstream reserve policy');
  assert.equal(quota.params[0], 'avioadsb.org');
  assert.equal(quota.params[1], 7);
  assert.ok(quota.params[2] > Date.now() + 119000);
});
test('recovery success decreases failure count gradually instead of restoring burst traffic', async () => {
  const before = Date.now();
  const out = await simulated({ state: { failures: 3 }, response: () => snapshot() });
  assert.equal(out.error, undefined);
  const update = out.writes.find(x => x.sql.includes('last_status=200'));
  assert.ok(update);
  assert.equal(update.params[1], 2, 'one successful probe reduces failures only one step');
  assert.ok(
    update.params[0] >= before + 2 * 60000,
    'two remaining failures enforce a two-minute recovery gap',
  );
});
