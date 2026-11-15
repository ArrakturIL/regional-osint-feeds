import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
function json(name){return JSON.parse(readFileSync(new URL(name,root),'utf8'));}
function workflow(){return readFileSync(new URL('.github/workflows/worker-architecture-preview.yml',root),'utf8');}

test('staged Editor binds both production schemas and Workers AI, but has no public route or cron',()=>{
 const cfg=json('deploy/wrangler.editor.qa.json');
 assert.equal(cfg.name,'regional-watch-editor-architecture-qa');
 assert.equal(cfg.workers_dev,false);
 assert.equal(cfg.compatibility_date,'2026-11-10');
 assert.deepEqual(cfg.d1_databases.map(x=>x.binding).sort(),['CORE_DB','NEWS_DB']);
 assert.equal(cfg.ai.binding,'AI');
 assert.ok(!('triggers' in cfg)||!cfg.triggers?.crons?.length);
 assert.ok(!cfg.routes?.length);
});

test('staged Monitor does not create a second minute-by-minute schedule or expose secrets',()=>{
 const cfg=json('deploy/wrangler.monitor.qa.json');
 assert.equal(cfg.name,'regional-osint-monitor-architecture-qa');
 assert.equal(cfg.workers_dev,false);
 assert.equal(cfg.compatibility_date,'2026-11-10');
 assert.deepEqual(cfg.d1_databases.map(x=>x.binding),['DB']);
 assert.equal(cfg.vars.REGION,'{"marine":[47,22,61,31]}');
 assert.ok(!('triggers' in cfg)||!cfg.triggers?.crons?.length);
 assert.ok(!cfg.routes?.length);
 assert.equal(cfg.secrets,undefined);
});

test('staging only executes for trusted same-repo integration PR, never production scripts',()=>{
 const y=workflow();
 assert.match(y,/github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
 assert.match(y,/github\.head_ref == 'infra\/regional-watch-workers-20261115'/);
 assert.match(y,/github\.base_ref == 'main'/);
 assert.match(y,/wrangler\.editor\.qa\.json/);
 assert.match(y,/wrangler\.monitor\.qa\.json/);
 assert.match(y,/secrets\.CLOUDFLARE_WORKERS_API_TOKEN/);
 assert.doesNotMatch(y,/secrets\.CLOUDFLARE_API_TOKEN/);
 assert.match(y,/workers_dev: false|workers_dev/);
 assert.doesNotMatch(y,/cron:/);
 assert.doesNotMatch(y,/regional-watch-editor\.production/);
 assert.doesNotMatch(y,/regional-osint-monitor\.production/);
});
