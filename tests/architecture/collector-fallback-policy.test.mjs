import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

// Exercise each actual GitHub Actions step's expression against controlled
// collector + D1 outcomes. A failed collector must never publish half-written
// fallback data, while a failed primary D1 sync must retain legacy fallback.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cases = [
  {
    source: 'centcom',
    path: '.github/workflows/centcom-test.yml',
    collect: 'Fetch and validate official DVIDS CENTCOM news',
    fallback: 'Commit updated news or status heartbeat',
  },
  {
    source: 'gdelt',
    path: '.github/workflows/gdelt.yml',
    collect: 'Read recent public GDELT Project event exports',
    fallback: 'Commit only small bounded news-context metadata',
  },
];
function step(workflow, name) {
  const lines = readFileSync(resolve(root, workflow), 'utf8').split(/\r?\n/);
  const start = lines.findIndex(line => line === '      - name: ' + name);
  assert.ok(start >= 0, workflow + ' missing step ' + name);
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('      - ')) end++;
  return lines.slice(start, end).join('\n');
}
function fallbackRuns(
  item,
  {
    collect = 'success',
    primary = true,
    neon = 'success',
    event = 'schedule',
    branch = 'refs/heads/main',
  } = {},
) {
  const collector = step(item.path, item.collect);
  const fallback = step(item.path, item.fallback);
  const condition = fallback.split('\n').find(line => line.startsWith('        if: '));
  assert.ok(condition, item.path + ' fallback must declare its gate');
  const hasOutcome = collector.split('\n').some(line => line === '        id: collect');
  const sourceOutcome = hasOutcome ? collect : '';
  const vars = {
    REGIONAL_NEON_PRIMARY_SOURCES: primary ? item.source : '',
    REGIONAL_NEON_D1_SOURCES: primary ? item.source : '',
  };
  const context = {
    github: { ref: branch, event_name: event },
    vars,
    steps: {
      collect: { outcome: sourceOutcome },
      rollout: { outputs: { enabled: primary ? 'true' : 'false' } },
      neon_d1: { outcome: neon },
    },
    always: () => true,
    success: () => collect === 'success',
    contains: (haystack, needle) => String(haystack ?? '').includes(String(needle)),
    format: (template, ...values) =>
      String(template).replace(/\{(\d+)\}/g, (_all, i) => String(values[Number(i)] ?? '')),
  };
  return Boolean(runInNewContext(condition.slice('        if: '.length), context, { timeout: 100 }));
}

for (const item of cases) {
  test(item.source + ': a failed or cancelled collector never publishes fallback files', () => {
    for (const collect of ['failure', 'cancelled']) {
      assert.equal(
        fallbackRuns(item, { collect, neon: 'skipped' }),
        false,
        collect + ' collector must not publish partial or old checkout data',
      );
      assert.equal(
        fallbackRuns(item, { collect, neon: 'failure' }),
        false,
        collect + ' collector must not publish even if primary sync failed',
      );
    }
  });
  test(item.source + ': a healthy primary sync avoids redundant GitHub commits', () => {
    assert.equal(fallbackRuns(item, { collect: 'success', neon: 'success' }), false);
  });
  test(item.source + ': verified collection retains GitHub fallback when Neon/D1 fails', () => {
    assert.equal(fallbackRuns(item, { collect: 'success', neon: 'failure' }), true);
    assert.equal(fallbackRuns(item, { collect: 'success', neon: 'skipped', primary: false }), true);
  });
  test(item.source + ': only main non-PR source runs may write fallback', () => {
    assert.equal(
      fallbackRuns(item, { collect: 'success', event: 'pull_request', branch: 'refs/pull/77/merge' }),
      false,
    );
    assert.equal(fallbackRuns(item, { collect: 'success', branch: 'refs/heads/feature/test' }), false);
  });
}
