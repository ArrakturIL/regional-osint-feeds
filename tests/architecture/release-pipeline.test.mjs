import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildManifest,verifyManifest} from '../../scripts/release/manifest.mjs';
import {validateWorker,validatePages,validateSubdomain,main as cloudflareGate} from '../../scripts/release/cloudflare-gate.mjs';
import {checkD1,verifyColumns} from '../../scripts/release/d1-preflight.mjs';

const root=resolve(new URL('../../',import.meta.url).pathname);
const contract=JSON.parse(readFileSync(join(root,'deploy/release-contract.json'),'utf8'));
const goodSha='f'.repeat(40);

function fakeRelease(){
 const dir=mkdtempSync(join(tmpdir(),'rw-release-'));
 for(const rel of [
   'pages/_worker.js','pages/index.html','pages/he/index.html',
   'pages/assets/app.js','pages/assets/app.css',
   'workers/editor.mjs','workers/monitor.mjs',
   'config/editor.json','config/monitor.json','metadata/contract.json','metadata/collector-rollout.json','metadata/release-workflow.yml'
 ]){
   const filename=join(dir,rel);
   mkdirSync(resolve(filename,'..'),{recursive:true});
   writeFileSync(filename,rel);
 }
 return dir;
}

test('release manifest locks Pages, both Workers and config to the exact source SHA and bytes',()=>{
 const dir=fakeRelease();
 try{
   const manifest=buildManifest(dir,goodSha);
   writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
   assert.equal(manifest.source_sha,goodSha);
   assert.equal(manifest.schema_version,1);
   assert.ok(manifest.files['pages/_worker.js']?.sha256);
   assert.ok(manifest.files['workers/editor.mjs']?.sha256);
   assert.ok(manifest.files['workers/monitor.mjs']?.sha256);
   assert.ok(manifest.files['config/editor.json']?.sha256);
   assert.ok(manifest.files['metadata/collector-rollout.json']?.sha256);
   assert.ok(manifest.files['metadata/release-workflow.yml']?.sha256);
   assert.equal(verifyManifest(dir,goodSha).source_sha,goodSha);
   assert.throws(()=>verifyManifest(dir,'a'.repeat(40)),/SHA|source/i);
   writeFileSync(join(dir,'workers/editor.mjs'),'tampered');
   assert.throws(()=>verifyManifest(dir,goodSha),/digest|hash|mismatch/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('release rejects missing artifact, symlink or extra unintended file',()=>{
 const dir=fakeRelease();
 try {
   const manifest=buildManifest(dir,goodSha);
   writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));
   rmSync(join(dir,'pages/_worker.js'));
   assert.throws(()=>verifyManifest(dir,goodSha),/missing|mismatch|unexpected/i);
   writeFileSync(join(dir,'pages/_worker.js'),'pages/_worker.js');
   writeFileSync(join(dir,'pages/unplanned.txt'),'some extra bytes');
   assert.throws(()=>verifyManifest(dir,goodSha),/unexpected|mismatch/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('release has source-controlled Worker identities, DB and cron, preserving active secrets and vars',()=>{
 assert.equal(contract.schema_version,1);
 assert.deepEqual(contract.workers.map(w=>w.name).sort(),['regional-osint-monitor','regional-watch-editor']);
 const editor=contract.workers.find(w=>w.key==='editor');
 const monitor=contract.workers.find(w=>w.key==='monitor');
 for(const w of contract.workers){
   const cfg=JSON.parse(readFileSync(join(root,w.config),'utf8'));
   assert.equal(cfg.name,w.name);
   assert.equal(cfg.keep_vars,true);
   assert.equal(cfg.preview_urls,false,'worker preview URLs must never be reenabled by Wrangler');
   assert.deepEqual(cfg.triggers.crons,[w.cron]);
   assert.deepEqual(cfg.d1_databases.map(x=>[x.binding,x.database_id]).sort(),w.d1.map(x=>[x.binding,x.database_id]).sort());
   assert.ok(!cfg.vars,'live plain_text vars must survive, not be redefined by code');
 }
 assert.equal(editor.ai,'AI');
 assert.deepEqual(monitor.secrets.sort(),['AIS_KEY','FIRMS_KEY','GFW_API_TOKEN','SUMMARY_TOKEN']);
 assert.ok(editor.name!==monitor.name);
});

test('Workers preview URL gate rejects public previews and refuses missing subdomain config',()=>{
 assert.doesNotThrow(()=>validateSubdomain({enabled:true,previews_enabled:false},{name:'regional-watch-editor'}));
 assert.throws(()=>validateSubdomain({enabled:true,previews_enabled:true},{name:'regional-watch-editor'}),/preview/i);
 assert.throws(()=>validateSubdomain({enabled:true},{name:'regional-watch-editor'}),/preview/i);
});

test('remote Worker validation fails closed on missing bindings, cron and secrets',()=>{
 const monitor=contract.workers.find(w=>w.key==='monitor');
 const settings={
   compatibility_date:'2026-11-10',
   bindings:[
      {name:'DB',type:'d1',id:monitor.d1[0].database_id},
      ...monitor.secrets.map(name=>({name,type:'secret_text'})),
      {name:'REGION',type:'plain_text'},
      {name:'COLLECTOR_CACHE_SOURCES',type:'plain_text'}
   ]
 };
 assert.doesNotThrow(()=>validateWorker(monitor,settings,[{cron:monitor.cron}]));
 assert.throws(()=>validateWorker(monitor,{...settings,bindings:settings.bindings.filter(b=>b.name!=='DB')},[{cron:monitor.cron}]),/binding|D1/i);
 assert.throws(()=>validateWorker(monitor,{...settings,bindings:settings.bindings.filter(b=>b.name!=='AIS_KEY')},[{cron:monitor.cron}]),/secret|AIS_KEY/i);
 assert.throws(()=>validateWorker(monitor,settings,[{cron:'* * * * *'}]),/cron|schedule/i);
});

test('Pages preflight verifies that both service bindings resolve to correct Workers',()=>{
 const fake={production_branch:'main',deployment_configs:{
   production:{services:{
     EDITOR:{service:'regional-watch-editor',environment:'production'},
     MONITOR:{service:'regional-osint-monitor',environment:'production'}
   },d1_databases:{
      DB:{id:contract.pages.d1[0].database_id},
      NEWS_DB:{id:contract.pages.d1[1].database_id}
   }}
 }};
 assert.doesNotThrow(()=>validatePages(contract.pages,fake));
 fake.deployment_configs.production.services.EDITOR.service='different-worker';
 assert.throws(()=>validatePages(contract.pages,fake),/EDITOR|service/i);
});

test('Cloudflare gate snapshots exact versions and rolls back changed components, never exposing tokens',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'rw-release-baseline-'));
 const filename=join(dir,'baseline.json');
 const oldFetch=globalThis.fetch;
 const beforeEnv={...process.env};
 const old='11111111-1111-4111-8111-111111111111';
 const current='22222222-2222-4222-8222-222222222222';
 const oldPages='33333333-3333-4333-8333-333333333333';
 const currentPages='44444444-4444-4444-8444-444444444444';
 let released=false;
 const posts=[];
 process.env.CLOUDFLARE_ACCOUNT_ID='a'.repeat(32);
 process.env.CLOUDFLARE_API_TOKEN='pages-topsecret';
 process.env.CLOUDFLARE_D1_API_TOKEN='workers-topsecret';
 function settingsFor(w){
   return {compatibility_date:'2026-11-10',bindings:[
     ...w.d1.map(x=>({name:x.binding,type:'d1',id:x.database_id})),
     ...w.secrets.map(name=>({name,type:'secret_text'})),
     ...w.vars.map(name=>({name,type:'plain_text'})),
     ...(w.ai?[{name:w.ai,type:'ai'}]:[])
   ]};
 }
 globalThis.fetch=async (url,opts)=>{
   const path=new URL(url).pathname;
   let result;
   if(opts?.method==='POST'){
     posts.push({path,body:JSON.parse(opts.body)});
     result={};
   }else if(path.endsWith('/settings')){
     const w=contract.workers.find(w=>path.includes('/'+w.name+'/'));
     result=settingsFor(w);
   }else if(path.endsWith('/subdomain')){
     result={enabled:true,previews_enabled:false};
   }else if(path.endsWith('/schedules')){
     const w=contract.workers.find(w=>path.includes('/'+w.name+'/'));
     result={schedules:[{cron:w.cron}]};
   }else if(path.includes('/workers/scripts/')&&path.endsWith('/deployments')){
     result={deployments:[{versions:[{version_id:released?current:old,percentage:100}]}]};
   }else if(path.endsWith('/pages/projects/regional-watch')){
     result={production_branch:'main',deployment_configs:{production:{
       services:Object.fromEntries(contract.pages.services.map(s=>[s.binding,{service:s.service,environment:'production'}])),
       d1_databases:Object.fromEntries(contract.pages.d1.map(d=>[d.binding,{id:d.database_id}]))
     }}};
   }else if(path.endsWith('/pages/projects/regional-watch/deployments')){
     result=[{id:released?currentPages:oldPages,environment:'production',latest_stage:{status:'success'}}];
   }else{
     throw Error('Unexpected Cloudflare endpoint: '+path);
   }
   return {ok:true,status:200,json:async()=>({success:true,result})};
 };
 try{
   await cloudflareGate(['capture',goodSha,filename]);
   const baseline=JSON.parse(readFileSync(filename,'utf8'));
   assert.equal(baseline.source_sha,goodSha);
   assert.equal(baseline.workers.length,2);
   assert.deepEqual(baseline.workers.map(x=>x.version_id),[old,old]);
   assert.equal(baseline.pages.deployment_id,oldPages);
   assert.ok(!readFileSync(filename,'utf8').includes('topsecret'));
   released=true;
   await cloudflareGate(['rollback',goodSha,filename]);
   const workerPosts=posts.filter(x=>x.path.includes('/workers/scripts/'));
   const pagesPosts=posts.filter(x=>x.path.includes('/pages/projects/'));
   assert.equal(workerPosts.length,2);
   assert.equal(pagesPosts.length,1);
   assert.ok(workerPosts.every(x=>x.body.versions[0].version_id===old&&x.body.versions[0].percentage===100));
   assert.match(pagesPosts[0].path,/33333333-3333-4333-8333-333333333333\/rollback/);
   posts.length=0;
   await assert.rejects(cloudflareGate(['rollback','a'.repeat(40),filename]),/source SHA|identity/i);
   assert.equal(posts.length,0);
 }finally{
   globalThis.fetch=oldFetch;
   for(const key of ['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','CLOUDFLARE_D1_API_TOKEN']){
     if(key in beforeEnv)process.env[key]=beforeEnv[key];else delete process.env[key];
   }
   rmSync(dir,{recursive:true,force:true});
 }
});

test('migration gate reads real expected D1 table names but never sends writes',async()=>{
 const queries=[];
 const required=contract.schemas;
 assert.equal(required.length,2);
 const count=await checkD1(contract,async(db,sql)=>{
   queries.push({db,sql});
   const key=db===required[0].database_id?required[0]:required[1];
   const table=sql.match(/^PRAGMA table_info\(([a-z0-9_]+)\)$/)?.[1];
   assert.ok(table&&key.tables[table]);
   return key.tables[table].map(name=>({name}));
 });
 assert.equal(count,queries.length);
 assert.ok(queries.length>=5);
 assert.ok(queries.every(x=>x.sql.startsWith('PRAGMA table_info(')));
 await assert.rejects(checkD1(contract,async()=>[{name:'unrelated'}]),/incompatible schema/i);
 assert.throws(()=>verifyColumns(['id'],[{name:'source'}],'news.items'),/news\.items\.id/);
});

test('production publish workflow cannot deploy Pages independently and requires immutable unified artifact',()=>{
 const workflow=readFileSync(join(root,'.github/workflows/regional-watch-app-check.yml'),'utf8');
 assert.match(workflow,/name: Build immutable three-component release/);
 assert.match(workflow,/name: Publish coordinated Pages and Workers/);
 assert.match(workflow,/rw-unified-release-bundle/);
 assert.match(workflow,/CLOUDFLARE_D1_API_TOKEN/);
 assert.doesNotMatch(workflow,/CLOUDFLARE_WORKERS_API_TOKEN/);
 const gate=readFileSync(join(root,'scripts/release/cloudflare-gate.mjs'),'utf8');
 assert.match(gate,/CLOUDFLARE_D1_API_TOKEN/);
 assert.doesNotMatch(gate,/CLOUDFLARE_WORKERS_API_TOKEN/);
 assert.match(workflow,/verify\.mjs/);
 assert.match(workflow,/cloudflare-gate\.mjs/);
 assert.match(workflow,/rollback/);
 assert.doesNotMatch(workflow,/name: Publish Cloudflare Pages production only after main checks/);
 assert.match(workflow,/needs:\s*\[release-bundle\]/);
});
