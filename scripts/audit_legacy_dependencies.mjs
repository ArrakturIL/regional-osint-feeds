// ARCH-06: conservative, read-only inventory of runtime, CI, and legacy references.
// This is a safety classifier, never a deletion plan or a production publisher.
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,join,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const slash=s=>s.split(sep).join('/');
const sorted=items=>[...new Set(items)].sort();
const text=(root,path)=>readFileSync(join(root,...path.split('/')),'utf8');
const isModule=path=>/\.(?:[cm]?js)$/.test(path);
const exclusions=new Set(['.git','node_modules','dist','release','.wrangler','coverage']);
function walk(root,dir){
 const at=join(root,dir);
 if(!existsSync(at))return [];
 const result=[];
 for(const e of readdirSync(at,{withFileTypes:true})){
  if(exclusions.has(e.name))continue;
  const child=dir?dir+'/'+e.name:e.name;
  if(e.isSymbolicLink())continue; // Unknown links are never deletion candidates.
  if(e.isDirectory())result.push(...walk(root,child));
  else if(e.isFile())result.push(child);
 }
 return result.sort();
}
function requireFiles(root,paths,label){
 const missing=paths.filter(x=>!existsSync(join(root,...x.split('/'))));
 if(missing.length)throw Error(label+' missing: '+missing.join(', '));
}
function resolveLocal(root,source,raw){
 if(!raw.startsWith('./')&&!raw.startsWith('../'))return null;
 const absolute=resolve(root,dirname(source),raw.split(/[?#]/)[0]);
 const relativeName=slash(relative(root,absolute));
 if(relativeName.startsWith('../')||relativeName==='..')return null;
 const candidates=[relativeName,relativeName+'.js',relativeName+'.mjs',relativeName+'/index.js'];
 return candidates.find(x=>existsSync(join(root,...x.split('/'))))||null;
}
function sourceGraph(root,files){
 const edges=[],unresolved=[];
 for(const file of files.filter(isModule)){
  const code=text(root,file);
  // This is a syntactic lower bound, not a claim to discover computed imports.
  const matches=[
   ...code.matchAll(/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g),
   ...code.matchAll(/\bimport\s*(?:\(\s*)?['"](\.{1,2}\/[^'"]+)['"]/g),
   ...code.matchAll(/\b(?:require|new URL)\(\s*['"](\.{1,2}\/[^'"]+)['"]/g)
  ];
  for(const m of matches){
   const target=resolveLocal(root,file,m[1]);
   if(target)edges.push({from:file,to:target});
   else if(/\.([cm]?js)$/.test(m[1])&&/^(backend\/|frontend\/src\/|worker\/)/.test(file)&&!file.startsWith('worker/test-'))
    unresolved.push({from:file,reference:m[1]});
  }
 }
 return {edges:edges.sort((a,b)=>(a.from+' '+a.to).localeCompare(b.from+' '+b.to)),
  unresolvedRelativeImports:unresolved.sort((a,b)=>a.from.localeCompare(b.from))};
}
function reachable(starts,edges){
 const neighbors=new Map();
 for(const {from,to} of edges){if(!neighbors.has(from))neighbors.set(from,[]);neighbors.get(from).push(to);}
 const visited=new Set(),pending=[...starts];
 while(pending.length){
  const p=pending.pop();
  if(visited.has(p))continue;
  visited.add(p);
  for(const to of neighbors.get(p)||[])pending.push(to);
 }
 return visited;
}
function manifest(root,path,prefix){
 const payload=JSON.parse(text(root,path));
 if(!Array.isArray(payload.order)||!payload.order.every(x=>typeof x==='string'&&!x.startsWith('/')&&!x.includes('..')))
  throw Error('Invalid source build manifest: '+path);
 const items=payload.order.map(x=>prefix+x);
 requireFiles(root,items,path);
 if(sorted(items).length!==items.length)throw Error('Duplicate build input in '+path);
 return items;
}
export function auditLegacyDependencies(root){
 root=resolve(root);
 const release=text(root,'scripts/release/build.mjs');
 const entrypoints=['pages','editor','monitor'].map(x=>'backend/'+x+'/src/index.js');
 requireFiles(root,entrypoints,'production modules');
 for(const path of entrypoints)if(!release.includes(path))throw Error('Release entrypoint not sourced: '+path);
 const frontendJS=manifest(root,'frontend/build-order.json','frontend/src/');
 const frontendCSS=manifest(root,'frontend/styles-order.json','frontend/src/');
 const legacyJS=walk(root,'frontend/src/legacy').filter(x=>x.endsWith('.js'));
 const legacyCSS=walk(root,'frontend/src/styles').filter(x=>/legacy.*\.css$/.test(x));
 const activeLegacyJS=sorted(legacyJS.filter(x=>frontendJS.includes(x)));
 const activeLegacyCSS=sorted(legacyCSS.filter(x=>frontendCSS.includes(x)));
 const sources=sorted([
  ...walk(root,'backend'),...walk(root,'frontend/src'),...walk(root,'frontend/scripts'),
  ...walk(root,'frontend/tests'),...walk(root,'worker'),...walk(root,'scripts'),...walk(root,'tests')
 ]).filter(isModule);
 const graph=sourceGraph(root,sources);
 const prodReach=reachable([...entrypoints,...frontendJS],graph.edges);
 const workflows=walk(root,'.github/workflows').filter(x=>/\.ya?ml$/.test(x));
 const workflowTexts=new Map(workflows.map(x=>[x,text(root,x)]));
 // A test root counts as a retained CI dependency only if at least one workflow invokes it.
 const ciTestRoots=sorted([...workflowTexts.values()].flatMap(y=>
  [...y.matchAll(/\bnode\s+(worker\/test-[a-zA-Z0-9_-]+\.mjs)\b/g)].map(m=>m[1])));
 requireFiles(root,ciTestRoots,'legacy CI test');
 const testReach=reachable(ciTestRoots,graph.edges);
 const legacyWorkflows=workflows.filter(path=>
  /worker\/(?:\*\*|test-|live-editor\/|regional-osint-monitor\.js|regional-watch-editor\.js)/.test(workflowTexts.get(path)));
 const workerSource=walk(root,'worker').filter(isModule);
 const workerRuntime=workerSource.filter(x=>!/^worker\/test-/.test(x));
 const testReferenced=sorted(workerRuntime.filter(x=>testReach.has(x)));
 const productionReferenced=sorted(workerRuntime.filter(x=>prodReach.has(x)));
 const untestedCandidates=sorted(workerRuntime.filter(x=>!testReach.has(x)&&!prodReach.has(x)));
 const classifications=workerSource.map(path=>{
  const reasons=[],kind=ciTestRoots.includes(path)?'legacy-ci-test':
    prodReach.has(path)?'unexpected-production-dependency':
    testReach.has(path)?'historical-test-dependency':
    'not-proven-unused';
  if(ciTestRoots.includes(path))reasons.push('Launched by historical CI workflow');
  if(testReach.has(path)&&!ciTestRoots.includes(path))reasons.push('Reachable from historical CI tests');
  if(prodReach.has(path))reasons.push('Reachable from production entrypoint');
  if(workflows.some(w=>workflowTexts.get(w).includes(path)))reasons.push('Explicit workflow reference');
  if(!reasons.length)reasons.push('No static reference proven; computed imports and rollback may still depend on it');
  return {path,kind,reasons,decision:'keep-until-proven-safe'};
 });
 const baselineFiles=walk(root,'baselines/cloudflare/2026-11-14');
 const editor=baselineFiles.filter(x=>x.includes('/editor-v64/'));
 const monitor=baselineFiles.filter(x=>x.includes('/monitor-v47/'));
 const baselineConsumers=sources.filter(x=>text(root,x).includes('baselines/cloudflare/2026-11-14/'));
 return {
  schema:1,
  policy:{automaticDeletion:false,unknownReferencesAreSafeToDelete:false},
  production:{entrypoints,legacyWorkerEntrypoints:productionReferenced},
  frontend:{activeLegacyJS,unlistedLegacyJS:sorted(legacyJS.filter(x=>!frontendJS.includes(x))),
    activeLegacyCSS,unlistedLegacyCSS:sorted(legacyCSS.filter(x=>!frontendCSS.includes(x)))},
  worker:{testReferenced,productionReferenced,untestedCandidates,
    classifications},
  ci:{historicalTestRoots:ciTestRoots,legacyWorkflows:sorted(legacyWorkflows)},
  baselines:{editor,monitor,
    editorConsumers:baselineConsumers.filter(x=>text(root,x).includes('editor-v64')),
    monitorConsumers:baselineConsumers.filter(x=>text(root,x).includes('monitor-v47'))},
  graph:{files:sorted(sources),edges:graph.edges,unresolvedRelativeImports:graph.unresolvedRelativeImports}
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=auditLegacyDependencies(process.cwd());
  if(process.argv.includes('--summary'))console.log('ARCH06_AUDIT_SUMMARY '+JSON.stringify({
   scanned_source_files:report.graph.files.length,import_edges:report.graph.edges.length,
   historical_ci_test_roots:report.ci.historicalTestRoots.length,
   legacy_worker_sources:report.worker.classifications.length,
   covered_by_historical_tests:report.worker.testReferenced.length,
   unverified_worker_candidates:report.worker.untestedCandidates.length,
   unverified_worker_paths:report.worker.untestedCandidates,
   production_legacy_frontend_js:report.frontend.activeLegacyJS.length,
   production_legacy_frontend_css:report.frontend.activeLegacyCSS.length,
   frozen_editor_files:report.baselines.editor.length,
   frozen_monitor_files:report.baselines.monitor.length
  }));
  else console.log(JSON.stringify(report,null,2));
 }catch(error){console.error('ARCH-06 audit failed:',error.message);process.exitCode=1;}
}
