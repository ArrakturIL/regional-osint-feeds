// ARCH-01: read-only, reproducible release-source ownership and data-flow inventory.
// Static source constraints are not a claim of live provider health or UI acceptance.
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceGraphReport } from './source_graph.mjs';
import { EDITOR_ENDPOINTS, MONITOR_ENDPOINTS, LOCAL_ENDPOINTS } from '../backend/pages/src/routes.js';

const own = path => path.match(/^backend\/(pages|editor|monitor)\/src\/.+\.(?:js|mjs)$/)?.[1] || null;
const uniq = xs => [...new Set(xs)].sort();
const contents = (root, path) => readFileSync(join(root, ...path.split('/')), 'utf8');
const json = (root, path) => JSON.parse(contents(root, path));
function reachable(start, edges) {
  const visited = new Set(),
    todo = [start],
    neighbors = new Map();
  for (const e of edges) {
    if (!neighbors.has(e.from)) neighbors.set(e.from, []);
    neighbors.get(e.from).push(e.to);
  }
  while (todo.length) {
    const file = todo.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    for (const to of neighbors.get(file) || []) todo.push(to);
  }
  return visited;
}
const equals = (a, b) => JSON.stringify(uniq(a)) === JSON.stringify(uniq(b));
function bindings(conf) {
  return (conf.d1 || conf.d1_databases || []).map(x => x.binding);
}
const workflowFor = {
  analysts: 'analysts.yml',
  centcom: 'centcom-test.yml',
  copernicus: 'copernicus-analytics.yml',
  gdelt: 'gdelt.yml',
  marad: 'marad.yml',
  news_translation: 'news-open-source-translation.yml',
  satellite: 'satellite.yml',
  unosat: 'unosat-analyses.yml',
};
export function auditActiveArchitecture(root) {
  root = resolve(root);
  const graph = sourceGraphReport(root);
  const entrypoints = graph.production.entrypoints;
  const candidates = graph.graph.files.filter(f => own(f) !== null);
  const activeEdges = graph.graph.edges.filter(e => own(e.from) !== null);
  const modulesByOwner = Object.fromEntries(
    ['pages', 'editor', 'monitor'].map(owner => [owner, candidates.filter(x => own(x) === owner)]),
  );
  const components = entrypoints.map(entrypoint => {
    const owner = own(entrypoint);
    const reach = reachable(entrypoint, activeEdges);
    const actual = modulesByOwner[owner];
    return {
      owner,
      entrypoint,
      sourceModuleCount: actual.length,
      reachableModules: actual.filter(x => reach.has(x)),
      unreachableModules: actual.filter(x => !reach.has(x)),
      importedOutsideOwner: activeEdges.filter(e => own(e.from) === owner && own(e.to) !== owner),
    };
  });
  const release = json(root, 'deploy/release-contract.json'),
    editorConfig = json(root, 'deploy/wrangler.editor.production.json'),
    monitorConfig = json(root, 'deploy/wrangler.monitor.production.json');
  const releaseBuilder = contents(root, 'scripts/release/build.mjs');
  const mismatch = [];
  if (release.schema_version !== 1) mismatch.push('release schema version');
  for (const entry of entrypoints)
    if (!releaseBuilder.includes(entry)) mismatch.push('release missing entrypoint ' + entry);
  if (release.pages.production_branch !== 'main') mismatch.push('wrong production branch');
  const workers = new Map(release.workers.map(w => [w.key, w]));
  for (const [name, config] of [
    ['editor', editorConfig],
    ['monitor', monitorConfig],
  ]) {
    const spec = workers.get(name);
    if (!spec) {
      mismatch.push('missing ' + name + ' worker contract');
      continue;
    }
    if (config.name !== spec.name) mismatch.push('worker name: ' + name);
    if (config.triggers?.crons?.[0] !== spec.cron || config.triggers?.crons?.length !== 1)
      mismatch.push('cron: ' + name);
    if (!equals(bindings(spec), bindings(config))) mismatch.push('D1: ' + name);
    for (const specDb of spec.d1) {
      const sourceDb = config.d1_databases.find(db => db.binding === specDb.binding);
      if (sourceDb?.database_id !== specDb.database_id)
        mismatch.push('D1 identity: ' + name + '/' + specDb.binding);
    }
    if (spec.ai !== config.ai?.binding && spec.ai) mismatch.push('AI: ' + name);
    if (!config.main.includes('backend/' + name + '/dist/worker.modern.mjs'))
      mismatch.push('modern Worker bundle: ' + name);
  }
  const services = uniq(release.pages.services.map(x => x.binding));
  const pagesD1 = uniq(bindings(release.pages));
  if (!equals(services, ['EDITOR', 'MONITOR'])) mismatch.push('pages service routes');
  if (!equals(pagesD1, ['DB', 'NEWS_DB'])) mismatch.push('pages DB bindings');
  if (release.pages.d1.some(x => !x.database_id)) mismatch.push('pages D1 identity');
  const pagesSource = contents(root, 'backend/pages/src/index.js');
  if (
    !/env\.EDITOR\?\.fetch/.test(pagesSource) ||
    !/env\.MONITOR/.test(contents(root, 'backend/pages/src/api/monitor-public.js'))
  )
    mismatch.push('Pages service proxy references');
  const bindingSites = [];
  const known = {
    pages: new Set(['ASSETS', ...services, ...pagesD1]),
    editor: new Set(['AI', 'DB', ...bindings(workers.get('editor') || {})]),
    monitor: new Set(bindings(workers.get('monitor') || {})),
  };
  const runtimeBindingGaps = [];
  // DB inside Editor analyst modules is the internal adapter injected from CORE_DB
  // at the entrypoint, not a third Cloudflare Editor D1 binding.
  for (const path of candidates) {
    const code = contents(root, path),
      owner = own(path),
      used = uniq([...code.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\b/g)].map(x => x[1]));
    if (used.length) bindingSites.push({ path, owner, names: used });
    for (const name of used.filter(n =>
      ['ASSETS', 'EDITOR', 'MONITOR', 'CORE_DB', 'NEWS_DB', 'DB', 'AI'].includes(n),
    )) {
      if (!known[owner].has(name)) runtimeBindingGaps.push(path + ': ' + name);
    }
  }
  const sourceFile = contents(root, 'scripts/neon_mirror.py'),
    block = sourceFile.match(/SOURCE_FILES:\s*dict\[[^\n]*\]\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  const sources = uniq([...block.matchAll(/^\s*"([^"]+)"\s*:/gm)].map(x => x[1]));
  const workflowGaps = [];
  for (const source of sources) {
    const name = workflowFor[source];
    if (!name) {
      workflowGaps.push(source + ': no owner workflow');
      continue;
    }
    const y = contents(root, '.github/workflows/' + name);
    for (const [code, needle] of [
      ['source mirror', 'publish_neon_mirror --source ' + source + ' --mode required'],
      ['D1 readback', 'neon_to_d1 --source ' + source + ' --init-table'],
      ['rollout flag', 'collector_rollout_flags --source ' + source],
      ['successful writeback gate', "steps.neon_d1.outcome == 'success'"],
      ['failed-writeback alert', "steps.neon_d1.outcome == 'failure'"],
    ])
      if (!y.includes(needle)) workflowGaps.push(source + ': ' + code);
  }
  const d1Module = contents(root, 'scripts/neon_to_d1.py'),
    syncModule = contents(root, 'scripts/sync_neon_primary_to_d1.py');
  const integrityGaps = [];
  for (const [label, src, needles] of [
    [
      'Neon source manifest',
      sourceFile,
      ['canonical_hash', 'READBACK_SQL', 'data_sha256', 'status_sha256', 'checked_at'],
    ],
    ['Neon -> D1', d1Module, ['READ_D1_SQL', 'UPSERT_D1_SQL', 'canonical_hash', '_validate_d1_row']],
    [
      'private reconciliation',
      syncModule,
      ['read_stored_snapshot', 'mirror_source', '_validate_d1_row', 'verify_d1_last_good', 'SOURCE_FILES'],
    ],
  ])
    for (const needle of needles) if (!src.includes(needle)) integrityGaps.push(label + ': ' + needle);
  const dynamicImportReview = [];
  for (const path of candidates) {
    const code = contents(root, path);
    for (const found of code.matchAll(/\bimport\s*\(\s*([^)]*)\)/g))
      dynamicImportReview.push({ path, expression: found[1].slice(0, 100) });
  }
  return {
    schema: 1,
    release: {
      entrypoints,
      services,
      pagesD1,
      editorD1: uniq(bindings(workers.get('editor') || {})),
      monitorD1: uniq(bindings(workers.get('monitor') || {})),
      editorAi: workers.get('editor')?.ai ?? null,
      crons: Object.fromEntries([...workers].map(([name, w]) => [name, w.cron])),
      configMismatches: mismatch,
      runtimeBindingGaps,
      bindingSites,
    },
    graph: {
      activeModuleCount: candidates.length,
      ownerCounts: Object.fromEntries(Object.entries(modulesByOwner).map(([k, v]) => [k, v.length])),
      activeImportEdges: activeEdges.length,
      unresolvedImports: graph.graph.unresolvedRelativeImports.filter(x => own(x.from) !== null),
      crossWorkerSourceImports: activeEdges.filter(e => own(e.to) !== null && own(e.from) !== own(e.to)),
      unreachableModules: components.flatMap(c => c.unreachableModules),
      components,
      dynamicImportReview,
    },
    routes: {
      editor: uniq(EDITOR_ENDPOINTS),
      monitor: uniq(Object.keys(MONITOR_ENDPOINTS)),
      pages: uniq(LOCAL_ENDPOINTS),
    },
    collectors: {
      sources,
      workflowGaps,
      integrityGaps,
      workflowOwnership: Object.entries(workflowFor)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([source, workflow]) => ({ source, workflow })),
    },
    boundaries: { frontendJs: graph.frontend.js.length, frontendCss: graph.frontend.css.length },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = auditActiveArchitecture(process.cwd());
    if (process.argv.includes('--summary'))
      console.log(
        'ARCH01_AUDIT_SUMMARY ' +
          JSON.stringify({
            activeModules: r.graph.activeModuleCount,
            ownerCounts: r.graph.ownerCounts,
            activeImportEdges: r.graph.activeImportEdges,
            unreachable: r.graph.unreachableModules,
            unresolved: r.graph.unresolvedImports,
            crossWorkerSourceImports: r.graph.crossWorkerSourceImports,
            releaseConfigMismatches: r.release.configMismatches,
            runtimeBindingGaps: r.release.runtimeBindingGaps,
            collectorSources: r.collectors.sources,
            workflowGaps: r.collectors.workflowGaps,
            integrityGaps: r.collectors.integrityGaps,
            dynamicImportReview: r.graph.dynamicImportReview,
          }),
      );
    else console.log(JSON.stringify(r, null, 2));
    if (
      r.graph.unreachableModules.length ||
      r.graph.unresolvedImports.length ||
      r.graph.crossWorkerSourceImports.length ||
      r.release.configMismatches.length ||
      r.release.runtimeBindingGaps.length ||
      r.collectors.workflowGaps.length ||
      r.collectors.integrityGaps.length
    )
      process.exitCode = 1;
  } catch (e) {
    console.error('ARCH-01 audit error: ' + e.message);
    process.exitCode = 1;
  }
}
