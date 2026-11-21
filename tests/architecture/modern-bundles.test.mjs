import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const expected = [
  ['frontend/dist/assets/app.modern.js', 'frontend'],
  ['backend/monitor/dist/worker.modern.mjs', 'monitor'],
  ['backend/editor/dist/worker.modern.mjs', 'editor'],
];
for (const [p, kind] of expected)
  test(kind + ' modern bundle exists and is nonempty', () => {
    const f = resolve(p);
    assert.ok(existsSync(f), p);
    assert.ok(statSync(f).size > 1000, kind + ' bundle is unexpectedly tiny');
  });
test('modern Monitor bundle exports fetch and scheduled callbacks', async () => {
  const m = await import('../..' + '/backend/monitor/dist/worker.modern.mjs');
  assert.equal(typeof m.default?.fetch, 'function');
  assert.equal(typeof m.default?.scheduled, 'function');
});
test('modern Editor bundle exports fetch and scheduled callbacks', async () => {
  const m = await import('../..' + '/backend/editor/dist/worker.modern.mjs');
  assert.equal(typeof m.default?.fetch, 'function');
  assert.equal(typeof m.default?.scheduled, 'function');
});
test('frontend modern bundle references the one React runtime and retains localization switching', () => {
  const s = readFileSync('frontend/dist/assets/app.modern.js', 'utf8');
  assert.ok(s.includes('UI_HE') || s.includes('/he'));
  assert.ok(s.includes('createRoot'));
  assert.ok(s.includes('rw-back-to-top'));
});
