import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditActiveArchitecture } from '../../scripts/audit_active_architecture.mjs';
import {
  ownership,
  EDITOR_ENDPOINTS,
  MONITOR_ENDPOINTS,
  LOCAL_ENDPOINTS,
} from '../../backend/pages/src/routes.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const audit = () => auditActiveArchitecture(root);

test('ARCH-01 checks complete current backend module graph from all three real release entrypoints', () => {
  const result = audit();
  assert.deepEqual(result.release.entrypoints, [
    'backend/pages/src/index.js',
    'backend/editor/src/index.js',
    'backend/monitor/src/index.js',
  ]);
  assert.equal(result.graph.unresolvedImports.length, 0, 'no dangling active relative imports');
  assert.equal(
    result.graph.crossWorkerSourceImports.length,
    0,
    'Workers use service bindings, never cross-import source trees',
  );
  assert.equal(
    result.graph.unreachableModules.length,
    0,
    'all production source modules must be owned by a release entrypoint or explicitly accounted for',
  );
  assert.ok(result.graph.activeModuleCount >= 70, 'active backend graph unexpectedly small');
});

test('ARCH-01 Pages exposes exact Editor, Monitor and local route owners', () => {
  const result = audit();
  assert.deepEqual(result.routes.editor, [...EDITOR_ENDPOINTS].sort());
  assert.deepEqual(result.routes.monitor, Object.keys(MONITOR_ENDPOINTS).sort());
  assert.deepEqual(result.routes.pages, [...LOCAL_ENDPOINTS].sort());
  for (const path of EDITOR_ENDPOINTS) assert.equal(ownership(path).kind, 'editor', path);
  for (const path of Object.keys(MONITOR_ENDPOINTS)) assert.equal(ownership(path).kind, 'monitor', path);
  for (const path of LOCAL_ENDPOINTS) assert.equal(ownership(path).kind, 'pages', path);
  assert.equal(
    ownership('/summary').kind,
    'not_found',
    'Monitor private summary must not be public Pages API',
  );
  assert.equal(ownership('/api/translation-queue').kind, 'not_found', 'private Editor queue not public');
});

test('ARCH-01 D1, AI and service bindings align with immutable release configuration', () => {
  const result = audit();
  assert.deepEqual(result.release.services, ['EDITOR', 'MONITOR']);
  assert.deepEqual(result.release.pagesD1, ['DB', 'NEWS_DB']);
  assert.deepEqual(result.release.editorD1, ['CORE_DB', 'NEWS_DB']);
  assert.deepEqual(result.release.monitorD1, ['DB']);
  assert.equal(result.release.editorAi, 'AI');
  assert.deepEqual(result.release.crons, { editor: '*/5 * * * *', monitor: '*/1 * * * *' });
  assert.equal(
    result.release.configMismatches.length,
    0,
    'source Wrangler and canonical release contract drift',
  );
  assert.equal(result.release.runtimeBindingGaps.length, 0, 'missing contractual binding for active source');
});

test('ARCH-01 every one of 8 mirrored collectors has its own gated workflow and private Neon-to-D1 path', () => {
  const result = audit();
  assert.deepEqual(result.collectors.sources, [
    'analysts',
    'centcom',
    'copernicus',
    'gdelt',
    'marad',
    'news_translation',
    'satellite',
    'unosat',
  ]);
  assert.equal(
    result.collectors.workflowGaps.length,
    0,
    'collector missing publish-to-Neon, source-scoped private D1 readback or verified fallback',
  );
  assert.equal(
    result.collectors.integrityGaps.length,
    0,
    'canonical digest, checked-at guard or readback not proven in source',
  );
});

test('ARCH-01 active source ownership is deterministic and maps to tracked source files', () => {
  const a = audit(),
    b = audit();
  assert.deepEqual(a, b);
  assert.equal(
    a.graph.ownerCounts.pages + a.graph.ownerCounts.editor + a.graph.ownerCounts.monitor,
    a.graph.activeModuleCount,
  );
  assert.ok(a.graph.activeImportEdges > 30);
  assert.ok(a.graph.components.every(c => c.entrypoint.startsWith('backend/' + c.owner + '/src/')));
  assert.ok(a.graph.dynamicImportReview.every(x => x.path.startsWith('backend/')));
});
