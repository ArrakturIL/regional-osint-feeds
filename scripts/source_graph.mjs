// Read-only source graph of the repository: production entrypoints, frontend
// manifests and static relative imports. Used by audit_active_architecture.mjs.
// (Legacy worker/ and baselines/ were removed 21.11; see git history.)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const slash = s => s.split(sep).join('/');
const sorted = items => [...new Set(items)].sort();
const text = (root, path) => readFileSync(join(root, ...path.split('/')), 'utf8');
const isModule = path => /\.(?:[cm]?js)$/.test(path);
const exclusions = new Set(['.git', 'node_modules', 'dist', 'release', '.wrangler', 'coverage']);
function walk(root, dir) {
  const at = join(root, dir);
  if (!existsSync(at)) return [];
  const result = [];
  for (const e of readdirSync(at, { withFileTypes: true })) {
    if (exclusions.has(e.name)) continue;
    const child = dir ? dir + '/' + e.name : e.name;
    if (e.isSymbolicLink()) continue; // Unknown links are never deletion candidates.
    if (e.isDirectory()) result.push(...walk(root, child));
    else if (e.isFile()) result.push(child);
  }
  return result.sort();
}
function requireFiles(root, paths, label) {
  const missing = paths.filter(x => !existsSync(join(root, ...x.split('/'))));
  if (missing.length) throw Error(label + ' missing: ' + missing.join(', '));
}
function resolveLocal(root, source, raw) {
  if (!raw.startsWith('./') && !raw.startsWith('../')) return null;
  const absolute = resolve(root, dirname(source), raw.split(/[?#]/)[0]);
  const relativeName = slash(relative(root, absolute));
  if (relativeName.startsWith('../') || relativeName === '..') return null;
  const candidates = [relativeName, relativeName + '.js', relativeName + '.mjs', relativeName + '/index.js'];
  return candidates.find(x => existsSync(join(root, ...x.split('/')))) || null;
}
function sourceGraph(root, files) {
  const edges = [],
    unresolved = [];
  for (const file of files.filter(isModule)) {
    const code = text(root, file);
    // This is a syntactic lower bound, not a claim to discover computed imports.
    const matches = [
      ...code.matchAll(/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g),
      ...code.matchAll(/\bimport\s*(?:\(\s*)?['"](\.{1,2}\/[^'"]+)['"]/g),
      ...code.matchAll(/\b(?:require|new URL)\(\s*['"](\.{1,2}\/[^'"]+)['"]/g),
    ];
    for (const m of matches) {
      const target = resolveLocal(root, file, m[1]);
      if (target) edges.push({ from: file, to: target });
      else if (/\.([cm]?js)$/.test(m[1]) && /^(backend\/|frontend\/src\/)/.test(file))
        unresolved.push({ from: file, reference: m[1] });
    }
  }
  return {
    edges: edges.sort((a, b) => (a.from + ' ' + a.to).localeCompare(b.from + ' ' + b.to)),
    unresolvedRelativeImports: unresolved.sort((a, b) => a.from.localeCompare(b.from)),
  };
}
function reachable(starts, edges) {
  const neighbors = new Map();
  for (const { from, to } of edges) {
    if (!neighbors.has(from)) neighbors.set(from, []);
    neighbors.get(from).push(to);
  }
  const visited = new Set(),
    pending = [...starts];
  while (pending.length) {
    const p = pending.pop();
    if (visited.has(p)) continue;
    visited.add(p);
    for (const to of neighbors.get(p) || []) pending.push(to);
  }
  return visited;
}
function manifest(root, path, prefix) {
  const payload = JSON.parse(text(root, path));
  if (
    !Array.isArray(payload.order) ||
    !payload.order.every(x => typeof x === 'string' && !x.startsWith('/') && !x.includes('..'))
  )
    throw Error('Invalid source build manifest: ' + path);
  const items = payload.order.map(x => prefix + x);
  requireFiles(root, items, path);
  if (sorted(items).length !== items.length) throw Error('Duplicate build input in ' + path);
  return items;
}
export function sourceGraphReport(root) {
  root = resolve(root);
  const release = text(root, 'scripts/release/build.mjs');
  const entrypoints = ['pages', 'editor', 'monitor'].map(x => 'backend/' + x + '/src/index.js');
  requireFiles(root, entrypoints, 'production modules');
  for (const path of entrypoints)
    if (!release.includes(path)) throw Error('Release entrypoint not sourced: ' + path);
  const frontendJS = manifest(root, 'frontend/build-order.json', 'frontend/src/');
  const frontendCSS = manifest(root, 'frontend/styles-order.json', 'frontend/src/');
  const sources = sorted([
    ...walk(root, 'backend'),
    ...walk(root, 'frontend/src'),
    ...walk(root, 'frontend/scripts'),
    ...walk(root, 'frontend/tests'),
    ...walk(root, 'scripts'),
    ...walk(root, 'tests'),
  ]).filter(isModule);
  const graph = sourceGraph(root, sources);
  const prodReach = reachable([...entrypoints, ...frontendJS], graph.edges);
  return {
    schema: 2,
    production: { entrypoints, reachable: sorted([...prodReach]) },
    frontend: { js: frontendJS, css: frontendCSS },
    graph: {
      files: sorted(sources),
      edges: graph.edges,
      unresolvedRelativeImports: graph.unresolvedRelativeImports,
    },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = sourceGraphReport(process.cwd());
  console.log(
    'SOURCE_GRAPH ' +
      JSON.stringify({
        files: report.graph.files.length,
        import_edges: report.graph.edges.length,
        unresolved: report.graph.unresolvedRelativeImports.length,
        production_reachable: report.production.reachable.length,
      }),
  );
}
