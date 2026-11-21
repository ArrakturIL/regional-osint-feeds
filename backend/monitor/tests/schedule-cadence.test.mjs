import test from 'node:test';
import assert from 'node:assert/strict';
import * as scheduler from '../src/schedule/runner.js';
import { sources } from '../src/schedule/sources.js';

test('Monitor scheduler exports a pure source eligibility contract', () => {
  assert.equal(
    typeof scheduler.scheduledSourceNames,
    'function',
    'scheduler selection must be testable independently of network, D1, and cron',
  );
});

test('every registered source preserves exact cadence across a UTC day, without extra calls', () => {
  if (typeof scheduler.scheduledSourceNames !== 'function') return; // First RED names missing export.
  const registered = new Map(sources.map(s => [s.name, s.every]));
  assert.equal(registered.size, sources.length, 'source registry must not duplicate keys');
  assert.ok(sources.length > 0, 'registered sources must not be empty');
  const actual = new Map([...registered].map(([name]) => [name, []]));
  for (let minute = 0; minute < 1440; minute++) {
    const due = scheduler.scheduledSourceNames(minute);
    assert.ok(Array.isArray(due), 'slot=' + minute);
    assert.equal(new Set(due).size, due.length, 'duplicate collector in slot ' + minute);
    for (const name of due) {
      assert.ok(registered.has(name), 'unknown automatic source ' + name);
      actual.get(name).push(minute);
    }
    assert.deepEqual(
      scheduler.scheduledSourceNames(minute + 1440),
      due,
      'one-day offset cannot alter source budget at minute ' + minute,
    );
  }
  for (const [name, every] of registered) {
    assert.ok(Number.isInteger(every) && every >= 1 && 1440 % every === 0, name + ' invalid cadence');
    const slots = actual.get(name);
    assert.equal(slots.length, 1440 / every, name + ' daily eligibility count drifted');
    for (let i = 0; i < slots.length; i++) {
      const next = slots[(i + 1) % slots.length];
      const gap = (next + 1440 - slots[i]) % 1440 || 1440;
      assert.equal(gap, every, name + ' cadence drifted at UTC minute ' + slots[i]);
    }
  }
});

test('automatic eligibility is data-only and never skips the real high-priority collector slot', () => {
  if (typeof scheduler.scheduledSourceNames !== 'function') return;
  assert.ok(scheduler.scheduledSourceNames(0).includes('adsb'), 'ADS-B 15min focus cadence');
  assert.ok(scheduler.scheduledSourceNames(1).includes('ais'), 'AIS cadence remains 5min');
  assert.ok(scheduler.scheduledSourceNames(2).includes('easa'), 'EASA and MSCIO remain paired');
  assert.ok(scheduler.scheduledSourceNames(2).includes('mscio'));
  assert.ok(scheduler.scheduledSourceNames(2).includes('ioda'));
  assert.deepEqual(scheduler.scheduledSourceNames(-1 + 1440), scheduler.scheduledSourceNames(1439));
});

function fakeManualDatabase(wanted, slot, seed = []) {
  const statuses = new Map(seed.map(row => [row.source, row]));
  let finish = null;
  const db = {
    prepare(sql) {
      const stmt = (args = []) => ({
        sql,
        args,
        bind(...next) {
          return stmt(next);
        },
        async first() {
          if (sql.includes("FROM worker_manual_runs WHERE status='pending'"))
            return { id: 'manual-qa', sources_json: JSON.stringify(wanted) };
          if (sql.includes('FROM worker_provider_state'))
            return { failures: 0, next_allowed_at: 0, lease_until: 0 };
          throw Error('Unexpected SELECT first: ' + sql);
        },
        async all() {
          if (sql.includes('FROM source_status')) return { results: [...statuses.values()] };
          throw Error('Unexpected SELECT all: ' + sql);
        },
        async run() {
          if (sql.includes("UPDATE worker_manual_runs SET status='running'")) return { meta: { changes: 1 } };
          if (sql.includes('UPDATE worker_manual_runs SET status=?')) {
            finish = { status: args[0], report: JSON.parse(args[2]) };
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('INSERT INTO source_status')) {
            statuses.set(args[0], {
              source: args[0],
              attempted_at: args[1],
              state: args[3],
              detail: args[4],
            });
            return { meta: { changes: 1 } };
          }
          throw Error('Unexpected D1 write: ' + sql);
        },
      });
      return stmt();
    },
    async batch(statements) {
      for (const statement of statements) {
        if (statement.sql.startsWith('INSERT INTO source_status')) {
          const a = statement.args;
          statuses.set(a[0], { source: a[0], attempted_at: a[1], state: a[3], detail: a[4] });
        }
      }
      return [];
    },
  };
  return {
    db,
    get finish() {
      return finish;
    },
  };
}

test('manual source with partial upstream coverage is not reported as done', async () => {
  const slot = 22 * 60_000;
  const target = sources.find(s => s.name === 'adsb_alt');
  const original = target.read;
  const f = fakeManualDatabase(['adsb_alt'], slot);
  target.read = async () => ({ entries: [], missing: ['quota'], detail: 'Provider quota exhausted' });
  try {
    await scheduler.runSchedule({ scheduledTime: slot }, { DB: f.db });
    assert.equal(f.finish.status, 'partial');
    assert.deepEqual(f.finish.report.rejected, []);
    assert.deepEqual(
      f.finish.report.observed.map(x => x.state),
      ['partial'],
    );
  } finally {
    target.read = original;
  }
});

test('manual source read error is not reported as done merely because collect caught it', async () => {
  const slot = 22 * 60_000;
  const target = sources.find(s => s.name === 'adsb_alt');
  const original = target.read;
  const f = fakeManualDatabase(['adsb_alt'], slot);
  target.read = async () => {
    throw Error('upstream HTTP 429');
  };
  try {
    await scheduler.runSchedule({ scheduledTime: slot }, { DB: f.db });
    assert.equal(f.finish.status, 'partial');
    assert.deepEqual(
      f.finish.report.observed.map(x => x.state),
      ['error'],
    );
  } finally {
    target.read = original;
  }
});

test('missing manual secret cannot reuse stale source status as success', async () => {
  const slot = 23 * 60_000;
  const f = fakeManualDatabase(['ais'], slot, [
    {
      source: 'ais',
      state: 'ok',
      detail: null,
      attempted_at: slot - 5 * 60_000,
    },
  ]);
  await scheduler.runSchedule({ scheduledTime: slot }, { DB: f.db });
  assert.equal(f.finish.status, 'partial');
  assert.deepEqual(f.finish.report.missing_secrets, ['ais']);
  assert.deepEqual(f.finish.report.observed, [], 'only statuses for the current manual slot qualify');
});
