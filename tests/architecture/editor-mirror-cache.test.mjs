import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {readEditorCachedPair} from '../../backend/editor/src/mirrors/collector-cache.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const at=Date.parse('2026-11-15T12:00:00Z');
const summary={
  source:'analyst-source-items',schema_version:1,checked_at:new Date(at).toISOString(),
  items:[{id:'sample',text_status:'metadata_only'}]
};
const status={
  source:'analysts',state:'ok',checked_at:new Date(at).toISOString(),
  sources:[{id:'source-a',state:'ok'}]
};
const hash=x=>createHash('sha256').update(JSON.stringify(x&&typeof x==='object'?
 Array.isArray(x)?x:Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x),'utf8').digest('hex');
const record=(source='analysts',data=summary,health=status)=>({
 source_key:source,checked_at_ms:at,
 data_json:JSON.stringify(data),status_json:JSON.stringify(health),
 data_sha256:hash(data),status_sha256:hash(health)
});
const context=(row,flag='analysts')=>{
 const calls={core:[],news:0};
 return{
  calls,
  env:{
   REGIONAL_EDITOR_CACHE_SOURCES:flag,
   CORE_DB:{prepare(sql){calls.core.push(sql);return{bind(key){return{first:async()=>row}}}}},
   NEWS_DB:{prepare(){calls.news++;throw Error('NEWS_DB must not contain collector snapshots')}}
  }
 };
};
test('disabled editor reader does not query either D1 database',async()=>{
 const {env,calls}=context(record(),'');
 assert.equal(await readEditorCachedPair(env,'analysts',{nowMs:at+60000,maxAgeMs:4*3600000}),null);
 assert.equal(calls.core.length,0);
 assert.equal(calls.news,0);
});
test('valid analyst pair is read via CORE_DB, preserving both data and health',async()=>{
 const {env,calls}=context(record());
 const result=await readEditorCachedPair(env,'analysts',{nowMs:at+60000,maxAgeMs:4*3600000});
 assert.deepEqual(result.data,summary);
 assert.deepEqual(result.status,status);
 assert.equal(result.origin,'neon_d1_cache');
 assert.equal(calls.core.length,1);
 assert.equal(calls.news,0);
});
test('corrupted cached payload returns null so caller can retry GitHub',async()=>{
 const changed=record();
 changed.data_json=JSON.stringify({...summary,items:[{id:'corrupted'}]});
 assert.equal(await readEditorCachedPair(context(changed).env,'analysts',{nowMs:at+60000,maxAgeMs:4*3600000}),null);
});
test('stale cached status falls back without implying no events',async()=>{
 assert.equal(await readEditorCachedPair(context(record()).env,'analysts',
  {nowMs:at+8*3600000,maxAgeMs:4*3600000}),null);
});
test('editor cache reports enabled fallback without leaking private values and ignores disabled flag',async()=>{
 const notes=[];
 const onFallback=notice=>notes.push(notice);
 const corrupted=record();
 corrupted.data_sha256='0'.repeat(64);
 assert.equal(await readEditorCachedPair(context(corrupted).env,'analysts',
  {nowMs:at+60000,maxAgeMs:4*3600000,onFallback}),null);
 assert.deepEqual(notes,[{source:'analysts',reason:'cache_invalid'}]);
 assert.equal(await readEditorCachedPair(context(null).env,'analysts',
  {nowMs:at+60000,maxAgeMs:4*3600000,onFallback}),null);
 assert.deepEqual(notes[1],{source:'analysts',reason:'cache_missing'});
 assert.equal(await readEditorCachedPair(context(record(),'').env,'analysts',{onFallback}),null);
 assert.equal(notes.length,2);
});

test('source state error remains error rather than becoming empty success',async()=>{
 const error={...status,state:'error'};
 const result=await readEditorCachedPair(context(record('analysts',summary,error)).env,'analysts',
  {nowMs:at+60000,maxAgeMs:4*3600000});
 assert.equal(result.status.state,'error');
});
test('translation mirror source supports synthetic status and guarded language data',async()=>{
 const data={schema_version:1,generated_at:new Date(at).toISOString(),items:[]};
 const state={source:'news_localization',checked_at:new Date(at).toISOString(),state:'ok'};
 const {env,calls}=context(record('news_translation',data,state),'news_translation');
 const result=await readEditorCachedPair(env,'news_translation',{nowMs:at+60000,maxAgeMs:6*3600000});
 assert.deepEqual(result.data,data);
 assert.equal(calls.core.length,1);
});
test('unknown sources fail before any DB reads',async()=>{
 const {env,calls}=context(record());
 await assert.rejects(readEditorCachedPair(env,'../../secrets'),/unknown collector/);
 assert.equal(calls.core.length,0);
});
test('existing analyst and translation pipelines are wired to the shared editor cache',async()=>{
 const {readFileSync}=await import('node:fs');
 const analyst=readFileSync(new URL('../../backend/editor/src/analysts/editor.mjs',import.meta.url),'utf8');
 const translation=readFileSync(new URL('../../backend/editor/src/translations/news-mirror.mjs',import.meta.url),'utf8');
 assert.match(analyst,/readEditorCachedPair\(env,\s*'analysts'/);
 assert.match(translation,/readEditorCachedPair\(env,\s*'news_translation'/);
 assert.match(analyst,/readMirror\('analyst-source-items\.json'\)/);
 assert.match(translation,/MIRROR\+'\?bucket='/);
});
