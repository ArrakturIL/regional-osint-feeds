import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { sourceGraphReport } from '../../scripts/source_graph.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('three production entrypoints; no broken relative imports in backend or frontend sources', () => {
  const r = sourceGraphReport(root);
  assert.deepEqual(r.production.entrypoints, [
    'backend/pages/src/index.js',
    'backend/editor/src/index.js',
    'backend/monitor/src/index.js',
  ]);
  assert.deepEqual(r.graph.unresolvedRelativeImports, []);
  assert.ok(r.graph.edges.length > 100);
});

test('legacy worker/, baselines/ and site/ stay removed (21.11)', () => {
  for (const dir of ['worker', 'baselines', 'site']) assert.equal(existsSync(resolve(root, dir)), false, dir);
});
