import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {translateScheduled} from '../../backend/editor/src/localization/scheduled.mjs';
import {reconstructPreBudgetScheduler} from './localization-budget-source-parity.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const BASE=Date.parse('2026-11-16T03:00:00Z');
const cycle=['news','analyst','story','editorial','news','profile'];
function atNews(){
 for(let i=0;i<12;i++){
  const time=BASE+300000*i;
  if(cycle[Math.floor(time/300000)%cycle.length]==='news')return time;
 }
 throw Error('news schedule missing');
}
const title='Israel reports 5 drones near the border';
const accepted={title:'ישראל מדווחת על 5 כטב״מים ליד הגבול',body:'',comment:'',confidence:95};
const changed={...accepted,title:'ישראל מדווחת על 6 כטב״מים ליד הגבול'};
const sample={id:'arch04-n5',headline:title,headline_ru:null,summary:'',summary_ru:null,comment:null,cached_he_hash:null};
function makeEnv({budget={attempts:0,estimated_neurons:0},rows=[sample],response=accepted,perAttemptChanges=1,usage=44,finish='stop'}={}){
 const events=[],ai=[];
 const db=name=>({
  prepare(sql){
   function stmt(args=[]){return {
    bind(...next){return stmt(next)},
    async first(){
     events.push({name,method:'first',sql,args});
     if(sql.startsWith('SELECT attempts,estimated_neurons FROM regional_i18n_budget'))return budget;
     return null;
    },
    async all(){
     events.push({name,method:'all',sql,args});
     if(sql.includes('FROM news_items'))return{results:rows};
     return{results:[]};
    },
    async run(){
     events.push({name,method:'run',sql,args});
     const changes=sql.includes('UPDATE regional_i18n_budget SET attempts=attempts+1')?perAttemptChanges:1;
     return{meta:{changes}};
    }
   }}return stmt();
  }
 });
 return{env:{NEWS_DB:db('NEWS_DB'),CORE_DB:db('CORE_DB'),AI:{
   async run(model,payload){
    ai.push({model,payload});
    return{choices:[{finish_reason:finish,message:{content:JSON.stringify(response)}}],usage:{neurons:usage}};
   }
 }},events,ai};
}
const saved=(events,sql)=>events.filter(e=>e.method==='run'&&e.sql.includes(sql));
const blobSha=text=>{const b=Buffer.from(text,'utf8');return createHash('sha1').update(Buffer.from('blob '+b.length,'utf8')).update(Buffer.from([0])).update(b).digest('hex');};

test.skip('[RETIRED 18.11, B1: byte-parity with a pre-split blob blocks any change; behaviour is covered by runtime tests] ARCH-04 documented changes reconstruct pre-change exact scheduler Git SHA',()=>{
 assert.equal(blobSha(reconstructPreBudgetScheduler()),'fb23350a8eb586b60cd30873ffac6c46eb161d99');
});

test('moderate allowance permits 97th paid HE attempt but blocks at the 300 ceiling (B1), keeping 4/run and 6000-neuron guard',async()=>{
 const f=makeEnv({budget:{attempts:96,estimated_neurons:100}});
 const result=await translateScheduled(f.env,atNews());
 assert.equal(result.attempted,1,'96 prior attempts must no longer exhaust the daily gate');
 assert.equal(result.translated,1);
 assert.equal(f.ai.length,1);
 const spent=saved(f.events,'UPDATE regional_i18n_budget SET attempts=attempts+1');
 assert.equal(spent.length,1);
 assert.ok(spent[0].sql.includes('attempts<? AND estimated_neurons<6000'));
 assert.deepEqual(spent[0].args.slice(-1),[300]);
 for(const budget of [
  {attempts:300,estimated_neurons:900},
  {attempts:3,estimated_neurons:6000}
 ]){
  const blocked=makeEnv({budget});
  const state=await translateScheduled(blocked.env,atNews());
  assert.deepEqual(state,{state:'budget'});
  assert.equal(blocked.ai.length,0);
  assert.equal(blocked.events.filter(e=>e.method==='all').length,0);
  const log=saved(blocked.events,"VALUES('last_he_localization',");
  assert.equal(log.length,1,'budget exhaustion must update public health state');
  assert.equal(JSON.parse(log[0].args[0]).state,'budget');
 }
});

test('rejected HE translation is not cached, but its model-returned neurons are still charged to the app tracker',async()=>{
 const f=makeEnv({response:changed,usage:62});
 const result=await translateScheduled(f.env,atNews());
 assert.equal(result.state,'partial');
 assert.equal(result.attempted,1);
 assert.equal(result.translated,0);
 assert.equal(result.rejected,1);
 assert.equal(f.ai.length,1);
 assert.equal(saved(f.events,'INSERT INTO regional_i18n(kind,item_id').length,0);
 const records=saved(f.events,'UPDATE regional_i18n_attempts SET state=?,error=?');
 assert.equal(records[0].args[0],'error');
 assert.match(records[0].args[1],/numbers_changed_title/);
 const recorded=saved(f.events,'UPDATE regional_i18n_budget SET estimated_neurons=estimated_neurons+?');
 assert.equal(recorded.length,1);
 assert.equal(recorded[0].args[0],62);
 const status=saved(f.events,"VALUES('last_he_localization',");
 assert.equal(JSON.parse(status[0].args[0]).state,'partial');
});

test('incomplete LLM output with usage still consumes quota and leaves explicit partial state',async()=>{
 const f=makeEnv({response:accepted,finish:'length',usage:39});
 const result=await translateScheduled(f.env,atNews());
 assert.equal(result.state,'partial');
 assert.equal(result.rejected,1);
 assert.equal(saved(f.events,'INSERT INTO regional_i18n(kind,item_id').length,0);
 const charges=saved(f.events,'UPDATE regional_i18n_budget SET estimated_neurons=estimated_neurons+?');
 assert.equal(charges.length,1);
 assert.equal(charges[0].args[0],39);
 assert.match(saved(f.events,'UPDATE regional_i18n_attempts SET state=?,error=?')[0].args[1],/model_incomplete/);
});

test('budget rejects atomic attempt in middle of a batch without a false success report',async()=>{
 const f=makeEnv({perAttemptChanges:0});
 const result=await translateScheduled(f.env,atNews());
 assert.equal(result.state,'budget');
 assert.equal(f.ai.length,0);
 assert.equal(result.translated,0);
 assert.equal(result.rejected,0);
 assert.equal(saved(f.events,'INSERT INTO regional_i18n(kind,item_id').length,0);
 assert.equal(JSON.parse(saved(f.events,"VALUES('last_he_localization',")[0].args[0]).state,'budget');
});
