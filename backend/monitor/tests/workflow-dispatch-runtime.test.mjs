// SYS-01: GitHub's own cron fires collectors far less often than declared
// (analysts ran 4 of ~136 times in 34 h). Monitor's reliable */1 Cloudflare cron
// dispatches the collector workflows on their declared cadence instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import monitor from '../src/index.js';
import {WORKFLOW_CADENCE, dueWorkflows, dispatchDueWorkflows} from '../src/schedule/dispatch.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MIN = 60_000;
const at = (h, m) => Date.UTC(2026, 10, 18, h, m);

function fakeFetch(status = 204) {
  const calls = [];
  const fn = async (url, init) => { calls.push({url, init}); return new Response(null, {status}); };
  return {calls, fn};
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
    assert.deepEqual([...ours].sort((a, b) => a - b), [...declared].sort((a, b) => a - b), w.workflow);
  }
});

test('analysts is dispatched at :07 with a correct GitHub API request', async () => {
  const f = fakeFetch();
  const res = await dispatchDueWorkflows({GITHUB_DISPATCH_TOKEN: 'tok'}, at(13, 7), {fetch: f.fn});
  const call = f.calls.find(c => c.url.endsWith('/actions/workflows/analysts.yml/dispatches'));
  assert.ok(call, 'analysts.yml dispatched');
  assert.equal(call.url, 'https://api.github.com/repos/ArrakturIL/regional-osint-feeds/actions/workflows/analysts.yml/dispatches');
  assert.equal(call.init.method, 'POST');
  assert.deepEqual(JSON.parse(call.init.body), {ref: 'main'});
  assert.equal(call.init.headers.Authorization, 'Bearer tok');
  assert.ok(call.init.headers['User-Agent'], 'GitHub API rejects requests without User-Agent');
  assert.ok(res.dispatched.includes('analysts.yml'));
});

test('no token means no network calls', async () => {
  const f = fakeFetch();
  const res = await dispatchDueWorkflows({}, at(13, 7), {fetch: f.fn});
  assert.equal(f.calls.length, 0);
  assert.equal(res.skipped, 'no_token');
});

test('GitHub errors are reported, never thrown', async () => {
  const f = fakeFetch(403);
  const res = await dispatchDueWorkflows({GITHUB_DISPATCH_TOKEN: 'tok'}, at(13, 7), {fetch: f.fn, log: () => {}});
  assert.deepEqual(res.failed, [{workflow: 'analysts.yml', status: 403}]);
  const boom = await dispatchDueWorkflows({GITHUB_DISPATCH_TOKEN: 'tok'}, at(13, 7),
    {fetch: async () => { throw new Error('net'); }, log: () => {}});
  assert.equal(boom.failed[0].status, 'error');
});

test('Monitor scheduled dispatches even when the D1 collector schedule fails', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(null, {status: 204}); };
  const brokenDb = {prepare() { throw new Error('D1 down'); }};
  try {
    await assert.rejects(monitor.scheduled({scheduledTime: at(13, 7)}, {DB: brokenDb, GITHUB_DISPATCH_TOKEN: 'tok'}));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(calls.some(u => u.endsWith('/analysts.yml/dispatches')), 'dispatch must not depend on D1 health');
});
