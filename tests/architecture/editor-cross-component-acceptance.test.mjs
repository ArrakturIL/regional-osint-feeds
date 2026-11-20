import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import editor from '../../backend/editor/src/index.js';
import analystService from '../../backend/editor/src/analysts/editor.mjs';
import localization from '../../backend/editor/src/localization/localization.mjs';
import {handlePages} from '../../backend/pages/src/index.js';
import {ownership,EDITOR_ENDPOINTS} from '../../backend/pages/src/routes.js';
import {auditActiveArchitecture} from '../../scripts/audit_active_architecture.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=p=>readFileSync(resolve(root,p),'utf8');

test('ARCH-03 production Pages forwards real RU/HE language requests to modular Editor, without touching D1',async()=>{
 const calls=[];
 const forbiddingDb={prepare(){throw Error('unnecessary database access for language metadata')},
  batch(){throw Error('unnecessary database access')}};
 const env={EDITOR:{fetch(request){
  calls.push({path:new URL(request.url).pathname,search:new URL(request.url).search});
  return editor.fetch(request,{NEWS_DB:forbiddingDb,CORE_DB:forbiddingDb});
 }}};
 const good=await handlePages(new Request('https://regional-watch.pages.dev/api/languages?lang=he'),env);
 assert.equal(good.status,200);
 assert.deepEqual(await good.json(),{
  default:'ru',supported:['ru','he'],requested_language:'he',direction:{ru:'ltr',he:'rtl'}
 });
 const bad=await handlePages(new Request('https://regional-watch.pages.dev/api/languages?lang=en'),env);
 assert.equal(bad.status,400);
 assert.equal((await bad.json()).error,'unsupported_language');
 assert.deepEqual(calls.map(x=>x.path),['/api/languages','/api/languages']);
 assert.equal(calls[0].search,'?lang=he');
 assert.equal(calls[1].search,'?lang=en');
});

test('ARCH-03 actual Pages->Editor dynamic analyst detail preserves language validation and never exposes private editor queues',async()=>{
 const forwarded=[];
 const forbidden={prepare(){throw Error('invalid-lang validation must precede DB access')}};
 const env={EDITOR:{fetch(request){
  forwarded.push(new URL(request.url).pathname);
  return editor.fetch(request,{NEWS_DB:forbidden,CORE_DB:forbidden});
 }}};
 const bad=await handlePages(new Request('https://regional-watch.pages.dev/api/analyst-posts/post-123?lang=xx'),env);
 assert.equal(bad.status,400);
 assert.equal((await bad.json()).error,'unsupported_language');
 assert.deepEqual(forwarded,['/api/analyst-posts/post-123']);
 for(const path of ['/api/translation-queue','/summary','/api/private-editor-admin']){
  const response=await handlePages(new Request('https://regional-watch.pages.dev'+path),env);
  assert.equal(response.status,404,path+' must not reach private Worker route');
 }
 assert.deepEqual(forwarded,['/api/analyst-posts/post-123']);
 assert.equal(ownership('/api/analyst-posts/post-123').kind,'editor');
 for(const path of EDITOR_ENDPOINTS)assert.equal(ownership(path).kind,'editor',path);
});

// #8a: source formatting (Prettier) must not break these structural checks.
const code=s=>String(s).replace(/\s+/g,'').replace(/"/g,"'");
test('ARCH-03 actual modern facades retain scheduled and fetch delegates without importing any legacy Worker',()=>{
 assert.equal(typeof editor.scheduled,'function');
 assert.equal(typeof editor.fetch,'function');
 assert.equal(typeof analystService.scheduled,'function');
 assert.equal(typeof analystService.fetch,'function');
 assert.equal(typeof localization.scheduled,'function');
 assert.equal(typeof localization.fetch,'function');
 const scan=source('backend/editor/src/news/scan.mjs');
 for(const fragment of ['ingestNewsFeeds(env,now)','reconcile(env.NEWS_DB,now)',
  'translateTitles(env,now)','generateComments(env,now)','translateIDF(env,now)']){
  assert.ok(code(scan).includes(code(fragment)),'scan orchestration boundary missing '+fragment);
 }
 const analyst=source('backend/editor/src/analysts/editor.mjs');
 for(const module of ['source-ingestion.mjs','editorial-decision.mjs','queue-runner.mjs',
  'public-api.mjs','translation.mjs','../mirrors/collector-cache.mjs']){
  assert.ok(analyst.includes(module),'analyst modular delegate missing '+module);
 }
 const locales=source('backend/editor/src/localization/localization.mjs');
 for(const module of ['news-reader.mjs','editorial-reader.mjs','stories-reader.mjs',
  'analyst-api.mjs','scheduled.mjs']){
  assert.ok(locales.includes(module),'locale facade module missing '+module);
 }
 const main=source('backend/editor/src/index.js');
 for(const module of ['news/scan.mjs','api/official-posts.mjs','api/monitor-changes.mjs',
  'localization/localization.mjs','analysts/editor.mjs']){
  assert.ok(main.includes(module),'modern Editor entry must own '+module);
 }
 assert.equal(/\bfrom\s*['"][^'"]*worker\/live-editor\//.test(main),false);
});

test('ARCH-03 Editor scheduled dispatch keeps independent source, translation, enrichment and analyst pipelines',()=>{
 const entry=source('backend/editor/src/index.js');
 const markers=[
  'ctx.waitUntil(scan(aiEnv))',
  'getUTCMinutes()===20)ctx.waitUntil(archiveExpiredPolymarket(env.CORE_DB,Date.now()))',
  'ctx.waitUntil(localization.scheduled(aiEnv,event.scheduledTime))',
  'getUTCMinutes()%15===0',
  'ctx.waitUntil(importTranslationMirror(env))',
  'getUTCMinutes()%15===5',
  'ctx.waitUntil(enrichNewMonitorStories(aiEnv))',
  'getUTCMinutes() === 30',
  // E-01: the analyst editor needs the full env (cache flag + CORE_DB);
  // behaviour is covered by editor-entrypoint-analyst-wiring.test.mjs.
  'ctx.waitUntil(analystService.scheduled(event, {...aiEnv, DB: env.CORE_DB}))'
 ];
 for(const mark of markers)assert.ok(code(entry).includes(code(mark)),'Editor scheduled boundary drift: '+mark);
 assert.ok(!entry.includes('worker/live-editor'),'archived modules must not drive active cron');
 const analystQueue=source('backend/editor/src/analysts/queue-runner.mjs');
 assert.ok(analystQueue.includes('INSERT OR IGNORE INTO analyst_runs'),
  'analyst scheduler must keep idempotent hourly run gate');
 assert.ok(analystQueue.includes('MAX_AI_PER_RUN'),
  'analyst queue must retain explicit AI run budget');
});

test('ARCH-03 active Editor 45-module (+B1-B6 ai/glossary/verify/display-policy/tier/sla/prompts/eval) graph is complete, D1/AI bindings match release and CI owns regression suites',()=>{
 const audit=auditActiveArchitecture(root);
 const active=audit.graph.components.find(c=>c.owner==='editor');
 assert.ok(active);
 assert.equal(active.sourceModuleCount,51); // +B12 translations/watch, +H-04 news/source-controls, +Q1 translations/script-guard, +B10 translations/jobs, +B11 translations/glossary-wikidata and meaning-check
 assert.deepEqual(active.unreachableModules,[]);
 assert.deepEqual(active.importedOutsideOwner,[]);
 assert.deepEqual(audit.release.editorD1,['CORE_DB','NEWS_DB']);
 assert.equal(audit.release.editorAi,'AI');
 assert.equal(audit.release.crons.editor,'*/5 * * * *');
 assert.deepEqual(audit.release.configMismatches,[]);
 assert.deepEqual(audit.release.runtimeBindingGaps,[]);
 const workflow=source('.github/workflows/regional-watch-app-check.yml');
 for(const file of [
  'editor-modules.test.mjs','editor-scan-orchestration.test.mjs',
  'editor-localization-content-readers.test.mjs','editor-localization-scheduled.test.mjs',
  'editor-analyst-public-api.test.mjs','editor-analyst-source-ingestion.test.mjs',
  'editor-analyst-decision.test.mjs','editor-analyst-queue-runner.test.mjs',
  'editor-ai-comments.test.mjs','editor-scheduled-translations.test.mjs',
  'news-localization-provenance.test.mjs','translation-semantics.test.mjs',
  'translation-verify.test.mjs','news-display-policy.test.mjs','news-tier-sla.test.mjs','ai-eval.test.mjs','editor-translation-queue.test.mjs'
 ]) assert.ok(workflow.includes(file),'current Editor CI parity/test gate missing '+file);
});
