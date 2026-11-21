// SYS-01: GitHub's own cron fires collectors far less often than declared
// (analysts ran 4 of ~136 times in 34 h). Monitor's reliable */1 Cloudflare cron
// dispatches the collector workflows on their declared cadence instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import monitor from '../src/index.js';
import { WORKFLOW_CADENCE, dueWorkflows, dispatchDueWorkflows } from '../src/schedule/dispatch.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MIN = 60_000;
const at = (h, m) => Date.UTC(2026, 10, 18, h, m);

function fakeFetch(status = 204) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status });
  };
  return { calls, fn };
}

// Expand a 5-field cron (minute and hour fields only; day fields must be '*')
// into the set of UTC minute-of-day values it fires on.
function cronMinutes(expr) {
  const [mi, hr, dom, mon, dow] = expr.trim().split(/\s+/);
  assert.deepEqual([dom, mon, dow], ['*', '*', '*'], 'only daily-periodic crons supported: ' + expr);
  const field = (f, max) => {
    const out = new Set();
    for (const part of f.split(',')) {
      const [range, step] = part.split('/');
      let lo, hi;
      if (range === '*') [lo, hi] = [0, max - 1];
      else if (range.includes('-')) [lo, hi] = range.split('-').map(Number);
      else [lo, hi] = [Number(range), step ? max - 1 : Number(range)];
      for (let v = lo; v <= hi; v += Number(step || 1)) out.add(v);
    }
    return out;
  };
  const res = new Set();
  for (const h of field(hr, 24)) for (const m of field(mi, 60)) res.add(h * 60 + m);
  return res;
}

test('dispatch cadence matches every workflow cron it replaces', () => {
  assert.ok(WORKFLOW_CADENCE.length >= 8);
  for (const w of WORKFLOW_CADENCE) {
    const yaml = readFileSync(resolve(repo, '.github/workflows', w.workflow), 'utf8');
    assert.match(yaml, /workflow_dispatch/, w.workflow + ' must accept workflow_dispatch');
    const crons = [...yaml.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map(x => x[1]);
    assert.ok(crons.length >= 1, w.workflow + ' has a declared cron');
    const declared = new Set(crons.flatMap(c => [...cronMinutes(c)]));
    const ours = new Set();
    for (let m = 0; m < 1440; m++) if (dueWorkflows(at(0, 0) + m * MIN).includes(w.workflow)) ours.add(m);
    assert.deepEqual(
      [...ours].sort((a, b) => a - b),
      [...declared].sort((a, b) => a - b),
      w.workflow,
    );
  }
});

test('analysts is dispatched at :07 with a correct GitHub API request', async () => {
  const f = fakeFetch();
  const res = await dispatchDueWorkflows({ GITHUB_DISPATCH_TOKEN: 'tok' }, at(13, 7), { fetch: f.fn });
  const call = f.calls.find(c => c.url.endsWith('/actions/workflows/analysts.yml/dispatches'));
  assert.ok(call, 'analysts.yml dispatched');
  assert.equal(
    call.url,
    'https://api.github.com/repos/ArrakturIL/regional-osint-feeds/actions/workflows/analysts.yml/dispatches',
  );
  assert.equal(call.init.method, 'POST');
  assert.deepEqual(JSON.parse(call.init.body), { ref: 'main' });
  assert.equal(call.init.headers.Authorization, 'Bearer tok');
  assert.ok(call.init.headers['User-Agent'], 'GitHub API rejects requests without User-Agent');
  assert.ok(res.dispatched.includes('analysts.yml'));
});

test('no token means no network calls', async () => {
  const f = fakeFetch();
  const res = await dispatchDueWorkflows({}, at(13, 7), { fetch: f.fn });
  assert.equal(f.calls.length, 0);
  assert.equal(res.skipped, 'no_token');
});

test('GitHub errors are reported, never thrown', async () => {
  const f = fakeFetch(403);
  const res = await dispatchDueWorkflows({ GITHUB_DISPATCH_TOKEN: 'tok' }, at(13, 7), {
    fetch: f.fn,
    log: () => {},
  });
  assert.deepEqual(res.failed, [
    { workflow: 'analysts.yml', status: 403 },
    { workflow: 'adsb.yml', status: 403 },
  ]);
  const boom = await dispatchDueWorkflows({ GITHUB_DISPATCH_TOKEN: 'tok' }, at(13, 7), {
    fetch: async () => {
      throw new Error('net');
    },
    log: () => {},
  });
  assert.equal(boom.failed[0].status, 'error');
});

test('Monitor scheduled dispatches even when the D1 collector schedule fails', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    return new Response(null, { status: 204 });
  };
  const brokenDb = {
    prepare() {
      throw new Error('D1 down');
    },
  };
  try {
    await assert.rejects(
      monitor.scheduled({ scheduledTime: at(13, 7) }, { DB: brokenDb, GITHUB_DISPATCH_TOKEN: 'tok' }),
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(
    calls.some(u => u.endsWith('/analysts.yml/dispatches')),
    'dispatch must not depend on D1 health',
  );
});

// H-04: a rolled-back source's collector workflow is not dispatched.
function controlsDb(rows, fail = false) {
  return {
    prepare(sql) {
      return {
        bind(...p) {
          this.p = p;
          return this;
        },
        async all() {
          assert.match(sql, /FROM source_controls/);
          if (fail) throw Error('no such table: source_controls');
          return { results: rows.filter(r => r.until_ms == null || r.until_ms > this.p[0]) };
        },
      };
    },
  };
}
test('disabled source: its workflow is not dispatched, others in the slot still are', async () => {
  const t = at(0, 13); // 00:13 UTC: copernicus-analytics.yml is due (13 */6)
  const due = dueWorkflows(t);
  assert.ok(due.includes('copernicus-analytics.yml'), due.join());
  const f = fakeFetch();
  const out = await dispatchDueWorkflows(
    {
      GITHUB_DISPATCH_TOKEN: 't',
      DB: controlsDb([{ source: 'copernicus_ems', reason: 'x', until_ms: null }]),
    },
    t,
    { fetch: f.fn, log() {} },
  );
  assert.deepEqual(out.disabled, ['copernicus-analytics.yml']);
  assert.ok(!f.calls.some(c => c.url.includes('copernicus-analytics.yml')));
  assert.equal(f.calls.length, due.length - 1);
});
test('control lookup failure fails open: every due workflow is dispatched', async () => {
  const t = at(0, 13),
    f = fakeFetch();
  const out = await dispatchDueWorkflows({ GITHUB_DISPATCH_TOKEN: 't', DB: controlsDb([], true) }, t, {
    fetch: f.fn,
    log() {},
  });
  assert.equal(out.disabled, undefined);
  assert.equal(f.calls.length, dueWorkflows(t).length);
});
test('workflow→source map is the same in Monitor and the operator config', () => {
  const cfg = JSON.parse(readFileSync(resolve(repo, 'config/source-controls.json'), 'utf8')).components
    .monitor;
  const fromCadence = Object.fromEntries(
    WORKFLOW_CADENCE.filter(w => w.source).map(w => [w.workflow, w.source]),
  );
  assert.deepEqual(fromCadence, cfg.workflows);
  for (const [wf, src] of Object.entries(cfg.workflows)) {
    assert.ok(cfg.sources.includes(src), src);
    const yml = readFileSync(resolve(repo, '.github/workflows', wf), 'utf8');
    assert.match(
      yml,
      new RegExp('python3 -m scripts\\.source_gate --workflow ' + wf.replace('.', '\\.')),
      wf + ' has no source gate',
    );
    assert.match(yml, /if: needs\.source-gate\.outputs\.enabled == 'true'/, wf + ' collector job not gated');
  }
});
