import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAnalystQueue} from '../../backend/editor/src/analysts/queue-runner.mjs';
import analystService,{testHooks} from '../../backend/editor/src/analysts/editor.mjs';
import {reconstructAnalystQueueEditor} from './analyst-queue-source-parity.mjs';

const EDITOR_VERSION='analyst-editor-v1.1.2-translation',HOUR=3600000,DAY=24*HOUR;
const now=Date.parse('2026-11-16T03:15:00Z');
const plain=(text,max)=>String(text??'').replace(/\s+/g,' ').trim().slice(0,max);
const health={state:'ok',checked_at:new Date(now).toISOString(),sources:[{source_id:'src-one',state:'ok'}]};
const baseMirror={schema_version:1,checked_at:new Date(now).toISOString(),items:[]};
const enabled=[{id:'src-one',analyst_id:'analyst-one',type:'telegram_public',canonical_prefix:'https://t.me/source/',language:'ru',display_name:'Analyst',enabled:1}];
const content={id:'src-one:10',analyst_id:'analyst-one',source_id:'src-one',body:'Original content',content_hash:'hash',text_status:'full_text',published_at_ms:now-10};
const gitSha=text=>{const b=Buffer.from(text,'utf8');return createHash('sha1').update(Buffer.from('blob '+b.length,'utf8')).update(Buffer.from([0])).update(b).digest('hex')};
function fakeDb({existingRun=false,sources=enabled,recent=[],pending=[],priorAi=null}={}){
 const statements=[],runs=[],selects=[];
 const db={prepare(sql){
  let args=[];
  const stmt={bind(...xs){args=xs;return stmt},
   async run(){
    runs.push({sql,args});
    return {meta:{changes:sql.includes('INSERT OR IGNORE INTO analyst_runs')?(existingRun?0:1):1}};
   },
   async all(){
    selects.push({sql,args,method:'all'});
    if(sql.includes('FROM analyst_sources s JOIN analysts a'))return{results:sources};
    if(sql.includes('FROM analyst_publications WHERE status'))return{results:recent};
    if(sql.includes('FROM analyst_items i JOIN analysts a'))return{results:pending};
    throw Error('unexpected D1 query '+sql);
   },
   async first(){
    selects.push({sql,args,method:'first'});
    if(sql.includes('FROM analyst_ai_attempts'))return priorAi;
    if(sql.includes('FROM analyst_publications WHERE item_id'))return {headline:'Предыдущая публикация',summary:'Текст'};
    throw Error('unexpected D1 SELECT '+sql);
   }};
  statements.push({sql,stmt});return stmt;
 }};
 return {db,statements,runs,selects,finish(){
  const run=runs.find(x=>x.sql.includes('UPDATE analyst_runs SET completed_at_ms=?'));
  return run?{status:run.args[1],stats:JSON.parse(run.args[2])}:null;
 }};
}
function queue(deps={}){
 const called=[];
 const api=createAnalystQueue({
 EDITOR_VERSION,HOUR,DAY,MAX_AI_PER_RUN:3,REGION:/israel|iran|израил|иран/i,plain,
 readEditorCachedPair:async()=>({status:health,data:baseMirror}),
 readMirror:async()=>{throw Error('mirror should be cached')},
 sha256:async()=>content.content_hash,
 validateInput:()=>content,
 insertItem:async()=>true,
 decide:async()=> 'skip',...deps});
 return {...api,called};
}


test('pending queue gives metadata-only records immediate handling and fairly rotates full-text authors',()=>{
 const rows=[
  {id:'a1',source_id:'a',text_status:'full_text'},
  {id:'a2',source_id:'a',text_status:'full_text'},
  {id:'b1',source_id:'b',text_status:'full_text'},
  {id:'b2',source_id:'b',text_status:'full_text'},
  {id:'meta',source_id:'a',text_status:'metadata_only'}
 ];
 assert.deepEqual(queue().prioritizePending(rows).map(r=>r.id),['meta','a1','b1','a2','b2']);
});

test('scheduled run has one durable hourly idempotency gate before contacting providers',async()=>{
 const f=fakeDb({existingRun:true});
 const q=queue({readEditorCachedPair:async()=>{throw Error('should not fetch on duplicate run')}});
 await q.runEditor({DB:f.db},now);
 assert.equal(f.runs.length,1);
 assert.match(f.runs[0].sql,/INSERT OR IGNORE INTO analyst_runs/);
 assert.equal(f.runs[0].args[0],EDITOR_VERSION+':'+Math.floor(now/HOUR));
 assert.equal(f.finish(),null);
});

test('missing mirror records partial but continues existing pending queue without inventing source data',async()=>{
 const f=fakeDb({pending:[{id:'pending-meta',source_id:'src-one',text_status:'metadata_only',body:'',state:'pending',original_language:'ru'}]});
 const q=queue({readEditorCachedPair:async()=>{throw Error('provider unavailable')},
  decide:async()=> 'needs_data'});
 await q.runEditor({DB:f.db},now);
 const end=f.finish();
 assert.equal(end.status,'partial');
 assert.equal(end.stats.partial_sources,1);
 assert.equal(end.stats.pending_count,1);
 assert.equal(end.stats.needs_data,1);
 assert.equal(end.stats.processed,1);
 assert.equal(end.stats.errors,0);
 const err=f.runs.find(x=>x.sql.includes('UPDATE analyst_runs SET error_message=?'));
 assert.match(err?.args[0]||'',/mirror_fetch_failed: provider unavailable/);
});

test('verified mirror ingress uses original body hash and does not accept mismatched revisions',async()=>{
 const f=fakeDb();
 const input={source_id:'src-one',analyst_id:'analyst-one',id:'src-one:10'};
 let inserts=0;
 const q=queue({readEditorCachedPair:async()=>({status:health,data:{...baseMirror,items:[input,{...input,id:'src-one:bad'}]}}),
  validateInput:raw=>raw.id==='src-one:10'?content:{...content,id:raw.id},
  sha256:async original=>original==='Original content'?'hash':'mismatch',
  insertItem:async()=>{inserts++;return true}});
 await q.runEditor({DB:f.db},now);
 assert.equal(inserts,2);
 assert.equal(f.finish().stats.discovered,2);
 assert.equal(f.finish().stats.errors,0);
 const fBad=fakeDb();
 let unsafeWrites=0;
 const rejected=queue({readEditorCachedPair:async()=>({status:health,data:{...baseMirror,items:[input]}}),
  sha256:async()=> 'incorrect',insertItem:async()=>{unsafeWrites++;return true}});
 await rejected.runEditor({DB:fBad.db},now);
 assert.equal(unsafeWrites,0);
 assert.equal(fBad.finish().stats.errors,1);
 assert.equal(fBad.finish().status,'partial');
});

test('only three fresh AI-eligible pending posts are processed per invocation, without losing queue count',async()=>{
 const pending=Array.from({length:5},(_,i)=>({
  id:'i-'+i,source_id:'source-'+i,text_status:'full_text',
  original_language:'ru',body:'Israel regional security analysis '.repeat(12),
  state:'pending'
 }));
 const f=fakeDb({pending});
 const visited=[];
 const q=queue({decide:async(_db,_env,it)=>{visited.push(it.id);return 'skip'}});
 await q.runEditor({DB:f.db},now);
 assert.deepEqual(visited,['i-0','i-1','i-2']);
 const end=f.finish();
 assert.equal(end.status,'ok');
 assert.equal(end.stats.processed,3);
 assert.equal(end.stats.skipped,3);
 assert.equal(end.stats.pending_count,5);
 assert.equal(f.selects.filter(x=>x.sql.includes('analyst_ai_attempts')).length,5);
});

test('isolated source failure updates per-item attempts and marks partial without global run crash',async()=>{
 const pending=[{id:'bad-ai',source_id:'src-one',text_status:'full_text',
  original_language:'ru',body:'Israel regional security '.repeat(12),state:'pending'}];
 const f=fakeDb({pending});
 const q=queue({decide:async()=>{throw Error('upstream_ai_failure')}});
 await q.runEditor({DB:f.db},now);
 assert.equal(f.finish().status,'partial');
 assert.equal(f.finish().stats.errors,1);
 const fail=f.runs.find(x=>x.sql.includes('UPDATE analyst_items SET last_error=?'));
 assert.equal(fail.args[0],'upstream_ai_failure');
 assert.equal(fail.args[2],'bad-ai');
 assert.equal(f.finish().stats.processed,0);
});
