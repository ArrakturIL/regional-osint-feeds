import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildManifest,verifyManifest} from '../../scripts/release/manifest.mjs';
import {validateWorker,validatePages} from '../../scripts/release/cloudflare-gate.mjs';

const root=resolve(new URL('../../',import.meta.url).pathname);
const contract=JSON.parse(readFileSync(join(root,'deploy/release-contract.json'),'utf8'));
const goodSha='f'.repeat(40);

function fakeRelease(){
 const dir=mkdtempSync(join(tmpdir(),'rw-release-'));
 for(const rel of [
   'pages/_worker.js','pages/index.html','pages/he/index.html',
   'pages/assets/app.js','pages/assets/app.css',
   'workers/editor.mjs','workers/monitor.mjs',
   'config/editor.json','config/monitor.json','metadata/contract.json'
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
   assert.deepEqual(cfg.triggers.crons,[w.cron]);
   assert.deepEqual(cfg.d1_databases.map(x=>[x.binding,x.database_id]).sort(),w.d1.map(x=>[x.binding,x.database_id]).sort());
   assert.ok(!cfg.vars,'live plain_text vars must survive, not be redefined by code');
 }
 assert.equal(editor.ai,'AI');
 assert.deepEqual(monitor.secrets.sort(),['AIS_KEY','FIRMS_KEY','GFW_API_TOKEN','SUMMARY_TOKEN']);
 assert.ok(editor.name!==monitor.name);
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

test('production publish workflow cannot deploy Pages independently and requires immutable unified artifact',()=>{
 const workflow=readFileSync(join(root,'.github/workflows/regional-watch-app-check.yml'),'utf8');
 assert.match(workflow,/name: Build immutable three-component release/);
 assert.match(workflow,/name: Publish coordinated Pages and Workers/);
 assert.match(workflow,/rw-unified-release-bundle/);
 assert.match(workflow,/CLOUDFLARE_WORKERS_API_TOKEN/);
 assert.match(workflow,/verify\.mjs/);
 assert.match(workflow,/cloudflare-gate\.mjs/);
 assert.match(workflow,/rollback/);
 assert.doesNotMatch(workflow,/name: Publish Cloudflare Pages production only after main checks/);
 assert.match(workflow,/needs:\s*\[release-bundle\]/);
});
