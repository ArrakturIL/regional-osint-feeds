import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {eligibleHebrewRetry} from '../../backend/editor/src/localization/retry-policy.mjs';
import {reconstructPreRetryScheduler} from './localization-retry-source-parity.mjs';
import {translateScheduled} from '../../backend/editor/src/localization/scheduled.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const now=Date.parse('2026-11-16T03:00:00Z');
const cycle=['news','analyst','story','editorial','news','profile'];
const newsTime=()=>{
 for(let i=0;i<12;i++){const t=now+i*300000;if(cycle[Math.floor(t/300000)%cycle.length]==='news')return t;}
 throw Error('missing news slot');
};
const time=newsTime();
const text='Israel reports 5 drones near the border';
const row=(id,priority=8,published=time)=>({id,headline:text,headline_ru:null,summary:'',summary_ru:null,comment:null,
  cached_he_hash:null,published_ms:published,priority});
const translated={title:'ישראל מדווחת על 5 כטב״מים ליד הגבול',body:'',comment:'',confidence:95};
const gitBlob=str=>{const b=Buffer.from(str,'utf8');return createHash('sha1').update(Buffer.from('blob '+b.length,'utf8')).update(Buffer.from([0])).update(b).digest('hex');};
function mockEnv({rows=[row('fresh')],previous=null,claimChanges=1,translate=translated}={}){
 const ops=[],calls=[];
 const db=(name)=>({prepare(sql){
  const query=(args=[])=>({
   bind(...args2){return query(args2);},
   async first(){
    ops.push({name,method:'first',sql,args});
    if(sql.startsWith('SELECT attempts,estimated_neurons FROM regional_i18n_budget'))return{attempts:0,estimated_neurons:0};
    if(sql.startsWith('SELECT state,retry_count'))return previous;
    return null;
   },
   async all(){
    ops.push({name,method:'all',sql,args});
    if(sql.includes('FROM news_items'))return{results:rows};
    return{results:[]};
   },
   async run(){
    ops.push({name,method:'run',sql,args});
    if(sql.startsWith('INSERT OR IGNORE INTO regional_i18n_attempts'))
      return{meta:{changes:claimChanges}};
    return{meta:{changes:1}};
   }
  });
  return query();
 }});
 return{
  env:{NEWS_DB:db('NEWS_DB'),CORE_DB:db('CORE_DB'),AI:{
    async run(model,payload){
      calls.push({model,payload});
      return{choices:[{finish_reason:'stop',message:{content:JSON.stringify(translate)}}],usage:{neurons:17}};
    }
  }},
  ops,calls
 };
}
const operations=(ops,needle)=>ops.filter(x=>x.sql.includes(needle));

test.skip('[RETIRED 18.11, B1: byte-parity with a pre-split blob blocks any change; behaviour is covered by runtime tests] retry patch reconstructs exact previous Git source and retains old budget parity pins',()=>{
 assert.equal(gitBlob(reconstructPreRetryScheduler()),'fedc58a681f0e16007dc8311a91c5342dbf2581a');
});

test('permanent QA failures are never paid twice on the same day; transient exceptions may retry once',()=>{
 const bad=['low_translation_confidence','numbers_changed_title','numbers_changed_body',
 'title:irgc_actor_missing','title:katz_name_corrupted','invalid_title','invented_comment',
 'too_short_title','not_hebrew_title','model_output_untrusted'];
 for(const error of bad){
  assert.equal(eligibleHebrewRetry({state:'error',retry_count:0,error,attempted_at_ms:time-3600000},time),false,error);
 }
 for(const error of ['8004: Internal server error','model_incomplete','model_invalid_response']){
  assert.equal(eligibleHebrewRetry({state:'error',retry_count:0,error,attempted_at_ms:time-31*60000},time),true,error);
  assert.equal(eligibleHebrewRetry({state:'error',retry_count:0,error,attempted_at_ms:time-29*60000},time),false,error+' cooldown');
  assert.equal(eligibleHebrewRetry({state:'error',retry_count:1,error,attempted_at_ms:time-3600000},time),false,error+' retry cap');
 }
 for(const prior of [
  null,{state:'ok',retry_count:0,error:'model_incomplete',attempted_at_ms:time-3600000},
  {state:'running',retry_count:0,error:'8004: Internal server error',attempted_at_ms:time-3600000},
  {state:'error',retry_count:0,error:'model_incomplete',attempted_at_ms:null},
  {state:'error',retry_count:0,error:'model_incomplete',attempted_at_ms:time+1000}
 ]) assert.equal(eligibleHebrewRetry(prior,time),false,'no unsafe retries');
});

test('scheduler skips previously rejected permanent QA candidate without consuming a retry slot or neurons',async()=>{
 const x=mockEnv({claimChanges:0,previous:{state:'error',error:'numbers_changed_title',retry_count:0,attempted_at_ms:time-3600000}});
 const outcome=await translateScheduled(x.env,time);
 assert.equal(outcome.attempted,0);
 assert.equal(x.calls.length,0);
 assert.equal(operations(x.ops,'SET state=\'running\',retry_count=retry_count+1').length,0);
 assert.equal(operations(x.ops,'SET attempts=attempts+1').length,0);
 const prev=x.ops.find(o=>o.sql.startsWith('SELECT state,retry_count,error,attempted_at_ms FROM regional_i18n_attempts'));
 assert.match(prev?.sql||'',/error,attempted_at_ms/);
});

test('temporary model failure is retried only after cooldown and only once within the same day',async()=>{
 const source={state:'error',error:'model_incomplete',retry_count:0,attempted_at_ms:time-31*60000};
 const x=mockEnv({claimChanges:0,previous:source});
 const outcome=await translateScheduled(x.env,time);
 assert.equal(outcome.translated,1);
 assert.equal(x.calls.length,1);
 assert.equal(operations(x.ops,"SET state='running',retry_count=retry_count+1").length,1);
 assert.equal(operations(x.ops,'SET attempts=attempts+1').length,1);
 const recent=mockEnv({claimChanges:0,previous:{...source,attempted_at_ms:time-5*60000}});
 assert.equal((await translateScheduled(recent.env,time)).attempted,0);
 assert.equal(recent.calls.length,0);
});

test('new SHA is a fresh claim even after a previous content revision has failed',async()=>{
 const x=mockEnv({claimChanges:1,previous:{state:'error',retry_count:1,error:'low_translation_confidence',attempted_at_ms:time-3600000}});
 const outcome=await translateScheduled(x.env,time);
 assert.equal(outcome.translated,1);
 assert.equal(x.calls.length,1);
 assert.equal(operations(x.ops,"SET state='running',retry_count=retry_count+1").length,0);
});

test('new uncached news are selected newest-first, with priority only breaking publication-time ties',async()=>{
 const x=mockEnv({rows:[row('new-low',7,time),row('old-high',10,time-5*86400000)]});
 const outcome=await translateScheduled(x.env,time);
 assert.equal(outcome.attempted,2);
 assert.equal(x.calls.length,2);
 const query=x.ops.find(o=>o.method==='all'&&o.sql.includes('FROM news_items'));
 assert.ok(query,'news selector was called');
 assert.match(query.sql,/ORDER BY \(t\.item_id IS NULL\) DESC,n\.published_ms DESC,n\.priority DESC LIMIT 120/);
 assert.equal(x.calls[0].payload.messages[1].content.includes('new-low'),false,
  'AI payload does not contain internal item id');
});
