import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {auditLegacyDependencies} from '../../scripts/audit_legacy_dependencies.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const audit=()=>auditLegacyDependencies(root);

test('ARCH-06 has an explicit, non-destructive production-versus-test classification',()=>{
 const report=audit();
 assert.deepEqual(report.production.entrypoints,[
  'backend/pages/src/index.js','backend/editor/src/index.js','backend/monitor/src/index.js'
 ]);
 assert.ok(report.production.entrypoints.every(path=>!path.startsWith('worker/')));
 assert.equal(report.policy.automaticDeletion,false);
 assert.ok(report.policy.unknownReferencesAreSafeToDelete===false);
 assert.equal(report.graph.unresolvedRelativeImports.length,0,'broken relative import references in surveyed sources');
});

test('seven legacy-named JS components remain included in actual frontend build order',()=>{
 const report=audit();
 const actual=readdirSync(resolve(root,'frontend/src/legacy')).filter(x=>x.endsWith('.js')).map(x=>'frontend/src/legacy/'+x).sort();
 assert.equal(actual.length,7);
 assert.deepEqual(report.frontend.activeLegacyJS,actual);
 assert.deepEqual(report.frontend.unlistedLegacyJS,[]);
});

test('legacy-named CSS is actually in production stylesheet manifest',()=>{
 const report=audit();
 const css=['frontend/src/styles/legacy-theme.css','frontend/src/styles/locale-legacy.css'];
 assert.deepEqual(report.frontend.activeLegacyCSS,[...css].sort());
});

test('old worker sources are excluded from production but still depended on by historical CI tests',()=>{
 const report=audit();
 assert.ok(report.worker.testReferenced.includes('worker/regional-osint-monitor.js'));
 assert.ok(report.worker.testReferenced.includes('worker/regional-watch-editor.js'));
 assert.ok(report.worker.testReferenced.includes('worker/live-editor/localization.mjs'));
 assert.ok(report.worker.testReferenced.includes('worker/live-editor/translation-fact-guard.mjs'));
 assert.ok(report.ci.legacyWorkflows.includes('.github/workflows/worker-check.yml'));
 assert.ok(report.worker.untestedCandidates.every(x=>x.startsWith('worker/')));
 assert.ok(!report.worker.productionReferenced.some(x=>x.startsWith('worker/')));
});

test('frozen source snapshots have active regression consumers',()=>{
 const report=audit();
 assert.ok(report.baselines.editor.length>0);
 assert.ok(report.baselines.monitor.length>0);
 assert.ok(report.baselines.editorConsumers.includes('tests/architecture/editor-modules.test.mjs'));
 assert.ok(report.baselines.monitorConsumers.includes('backend/monitor/tests/source-parity.test.mjs'));
});

test('audit report is deterministic and purely derived from repository source',()=>{
 const a=audit(),b=audit();
 assert.deepEqual(a,b);
 assert.ok(a.graph.edges.length>50,'at least 50 directly resolved source imports');
 assert.ok(a.worker.classifications.length>10);
 assert.ok(a.worker.classifications.every(x=>x.decision!=='delete'));
 assert.ok(a.worker.classifications.every(x=>x.reasons.length>0));
});
