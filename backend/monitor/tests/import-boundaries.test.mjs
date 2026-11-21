import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'src');
const { order } = JSON.parse(readFileSync(resolve(root, 'build-order.json'), 'utf8'));

function importGraph() {
  const modules = new Set(order.map(x => resolve(src, x)));
  const graph = new Map();
  for (const file of modules) {
    assert.ok(existsSync(file), 'Monitor manifest file missing: ' + relative(src, file));
    const content = readFileSync(file, 'utf8');
    const deps = [];
    for (const line of content.split(/\r?\n/)) {
      const hit = line.match(/^\s*import\s+.*?\s+from\s+['"](\.[^'"]+)['"]\s*;?\s*$/);
      if (!hit) continue; // Only local static imports contribute to cycles.
      const target = resolve(dirname(file), hit[1]);
      assert.ok(
        target === src || target.startsWith(src + sep),
        'Monitor relative import leaves source directory: ' + relative(src, file),
      );
      assert.ok(
        modules.has(target),
        'Monitor imported module not in build manifest: ' + relative(src, file) + ' -> ' + hit[1],
      );
      deps.push(target);
    }
    graph.set(file, deps);
  }
  return graph;
}

test('all active Monitor modules have resolvable local import paths', () => {
  const graph = importGraph();
  assert.equal(graph.size, order.length);
  assert.ok(graph.size >= 40, 'unexpectedly small active Monitor manifest');
});

test('active Monitor ESM graph has no cyclic imports', () => {
  const graph = importGraph();
  const state = new Map(),
    stack = [],
    cycles = [];
  function visit(node) {
    state.set(node, 'visiting');
    stack.push(node);
    for (const dep of graph.get(node) || []) {
      if (state.get(dep) === 'visiting') {
        const at = stack.indexOf(dep);
        const loop = stack
          .slice(at)
          .concat(dep)
          .map(x => relative(src, x));
        if (cycles.length < 8) cycles.push(loop.join(' -> '));
      } else if (!state.has(dep)) visit(dep);
    }
    stack.pop();
    state.set(node, 'done');
  }
  for (const node of graph.keys()) if (!state.has(node)) visit(node);
  assert.deepEqual(
    cycles,
    [],
    'Cross-layer module cycles increase fragility; resolve without altering source behavior',
  );
});
