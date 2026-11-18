import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {reconstructReaderFacade} from './localization-source-parity.mjs';
import {reconstructPreBudgetScheduler} from './localization-budget-source-parity.mjs';
import {translateScheduled} from '../../backend/editor/src/localization/scheduled.mjs';
import {sourceText,fingerprint} from '../../backend/editor/src/localization/shared.mjs';
import {fingerprint as publicFingerprint} from '../../backend/editor/src/localization/localization.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const BASE=Date.parse('2026-11-16T02:00:00Z');
const cycle=['news','analyst','story','editorial','news','profile'];
const atKind=name=>{
 for(let i=0;i<12;i++){const n=BASE+i*300000;if(cycle[Math.floor(n/300000)%cycle.length]===name)return n;}
 throw Error('schedule kind missing: '+name);
};
function makeEnv({budget={attempts:0,estimated_neurons:0},newsRows=[],analystRows=[],coreRows=[],translate=null,errorInNews=false}={}){
 const events=[],ai=[];
 const makeDb=name=>({
  prepare(sql){
   const statement=(args=[])=>({
    bind(...v){return statement(v);},
    async first(){
     events.push({db:name,method:'first',sql,args});
     if(sql.startsWith('SELECT attempts,estimated_neurons FROM regional_i18n_budget'))return budget;
     if(sql.startsWith('SELECT source_hash FROM regional_i18n'))return null;
     if(sql.startsWith('SELECT state,retry_count FROM regional_i18n_attempts'))return null;
     if(sql.startsWith('SELECT title,body,commentary FROM regional_i18n'))return null;
     return null;
    },
    async all(){
     events.push({db:name,method:'all',sql,args});
     if(errorInNews&&name==='NEWS_DB')throw Error('test upstream unavailable');
     if(sql.includes('FROM news_items'))return {results:newsRows};
     if(sql.includes('FROM analyst_publications'))return {results:analystRows};
     return {results:coreRows};
    },
    async run(){
     events.push({db:name,method:'run',sql,args});
     return {meta:{changes:1}};
    }
   });return statement();
  }
 });
 const env={NEWS_DB:makeDb('NEWS_DB'),CORE_DB:makeDb('CORE_DB'),AI:{
  async run(model,params){
   ai.push({model,params});
   if(translate===null)throw Error('Unexpected AI usage');
   return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(translate)}}],usage:{neurons:44}};
  }
 }};
 return{env,events,ai};
}
const writes=(events,part)=>events.filter(e=>e.method==='run'&&e.sql.includes(part));
const newsRow=(id,n)=>({id,headline:'Israel reports '+n+' drones near the border',headline_ru:null,
 summary:'',summary_ru:null,comment:null,cached_he_hash:null});


test('shared source text and fingerprint retain public identity and never fabricate missing comments',async()=>{
 const row={headline:'Israel reports 5 drones',headline_ru:'Израиль сообщает о 5 беспилотниках',
  summary:'A statement from the border',summary_ru:'Заявление с границы',comment:null};
 const original=sourceText('news',row);
 // Owner 18.11: the Hebrew source is the original article, not headline_ru.
 assert.deepEqual(original,{title:'Israel reports 5 drones',body:'A statement from the border',comment:''});
 assert.equal(await fingerprint(original),await publicFingerprint(original));
 assert.match(await fingerprint(original),/^[a-f0-9]{64}$/);
});

test('daily Hebrew quotas block selection and AI before source queries at the 300-attempt or 6000-neuron ceiling (B1)',async()=>{
 for(const budget of [{attempts:300,estimated_neurons:0},{attempts:0,estimated_neurons:6000}]){
  const {env,events,ai}=makeEnv({budget});
  const result=await translateScheduled(env,atKind('news'));
  assert.deepEqual(result,{state:'budget'});
  assert.equal(ai.length,0);
  assert.equal(events.filter(e=>e.method==='all').length,0,'quota check precedes source scanning');
  assert.equal(writes(events,'INSERT OR IGNORE INTO regional_i18n_budget').length,1);
  assert.equal(writes(events,'last_he_localization').length,1,'explicit budget state replaces stale successful state');
 }
});

test('five-minute source cycle preserves analyst CORE_DB scanning and zero-attempt status',async()=>{
 const {env,events,ai}=makeEnv();
 const now=atKind('analyst');
 const result=await translateScheduled(env,now);
 assert.equal(result.state,'ok');
 assert.equal(result.kind,'analyst');
 assert.equal(result.attempted,0);
 assert.equal(result.translated,0);
 assert.equal(result.rejected,0);
 assert.equal(ai.length,0);
 assert.ok(events.some(e=>e.db==='CORE_DB'&&e.method==='all'&&e.sql.includes('FROM analyst_publications')));
 assert.equal(writes(events,"VALUES('last_he_localization',").length,1);
});

test('real candidate schedules preserve model, JSON schema, one paid attempt and D1 quality state',async()=>{
 const original=newsRow('n-5',5);
 const translated={title:'ישראל מדווחת על 5 כטב״מים ליד הגבול',body:'',comment:'',confidence:94};
 const {env,events,ai}=makeEnv({newsRows:[original],translate:translated});
 const result=await translateScheduled(env,atKind('news'));
 assert.equal(result.state,'ok');
 assert.equal(result.kind,'news');
 assert.equal(result.attempted,1);
 assert.equal(result.translated,1);
 assert.equal(result.rejected,0);
 assert.equal(ai.length,1);
 assert.equal(ai[0].model,'@cf/zai-org/glm-4.7-flash');
 assert.equal(ai[0].params.response_format.json_schema.strict,true);
 assert.equal(ai[0].params.temperature,0);
 assert.equal(ai[0].params.max_tokens,1700);
 assert.equal(writes(events,'INSERT OR IGNORE INTO regional_i18n_attempts').length,1);
 assert.equal(writes(events,'UPDATE regional_i18n_budget SET attempts=attempts+1').length,1);
 assert.equal(writes(events,'INSERT INTO regional_i18n(kind,item_id').length,1);
 assert.equal(writes(events,"UPDATE regional_i18n_attempts SET state=?,error=?").length,1);
 assert.equal(writes(events,'estimated_neurons=estimated_neurons+?').length,1);
});

test('high-confidence Hebrew with changed Arabic numerals is rejected and records an attempt',async()=>{
 const {env,events,ai}=makeEnv({
  newsRows:[newsRow('n-5',5)],
  translate:{title:'ישראל מדווחת על 6 כטב״מים ליד הגבול',body:'',comment:'',confidence:98}
 });
 const result=await translateScheduled(env,atKind('news'));
 assert.equal(result.state,'partial');
 assert.equal(result.attempted,1);
 assert.equal(result.translated,0);
 assert.equal(result.rejected,1);
 assert.equal(ai.length,1);
 assert.equal(writes(events,'INSERT INTO regional_i18n(kind,item_id').length,0);
 const completed=writes(events,"UPDATE regional_i18n_attempts SET state=?,error=?");
 assert.equal(completed.length,1);
 assert.equal(completed[0].args[0],'error');
 assert.match(completed[0].args[1],/numbers_changed_title/);
});

test('scheduler still handles at most four new items per cycle',async()=>{
 const {env,events,ai}=makeEnv({
  newsRows:Array.from({length:9},(_,i)=>newsRow('n-'+i,5+i)),
  translate:{title:'ישראל מדווחת על 9 כטב״מים ליד הגבול',body:'',comment:'',confidence:96}
 });
 const result=await translateScheduled(env,atKind('news'));
 assert.equal(result.attempted,4);
 assert.equal(result.rejected,4);
 assert.equal(ai.length,4);
 assert.equal(writes(events,'UPDATE regional_i18n_budget SET attempts=attempts+1').length,4);
});

test('upstream source errors are journaled and do not leave a false success state',async()=>{
 const {env,events}=makeEnv({errorInNews:true});
 const result=await translateScheduled(env,atKind('news'));
 assert.equal(result.state,'error');
 assert.match(result.error,/test upstream unavailable/);
 assert.equal(writes(events,"VALUES('last_he_localization_error',").length,1);
});

test('native Hebrew news never spends AI quota even when RU headline is present',async()=>{
 const native={id:'native-he',headline:'ישראל מדווחת על 5 כטב״מים',headline_ru:'Израиль сообщает о 5 беспилотниках',
  summary:'',summary_ru:null,comment:null,cached_he_hash:null};
 const english=newsRow('english-n5',5);
 const {env,events,ai}=makeEnv({newsRows:[native,english],
  translate:{title:'ישראל מדווחת על 5 כטב״מים ליד הגבול',body:'',comment:'',confidence:95}});
 const result=await translateScheduled(env,atKind('news'));
 assert.equal(result.attempted,1,'native Hebrew original is already available, even with translated Russian field');
 assert.equal(result.translated,1);
 assert.equal(ai.length,1);
 assert.deepEqual(writes(events,'INSERT OR IGNORE INTO regional_i18n_attempts').map(x=>x.args[1]),['english-n5']);
 assert.deepEqual(writes(events,'UPDATE regional_i18n_budget SET attempts=attempts+1').length,1);
});

test('only native Hebrew originals produce no paid calls or translation attempts',async()=>{
 const native={id:'native-only',headline:'משרד הביטחון מסר הודעה בישראל',headline_ru:'Министерство обороны сообщило в Израиле',
  summary:'',summary_ru:null,comment:null,cached_he_hash:null};
 const {env,events,ai}=makeEnv({newsRows:[native]});
 const result=await translateScheduled(env,atKind('news'));
 assert.equal(result.attempted,0);
 assert.equal(result.translated,0);
 assert.equal(ai.length,0);
 assert.equal(writes(events,'INSERT OR IGNORE INTO regional_i18n_attempts').length,0);
});

test('Hebrew headline with untranslated English summary still needs a Hebrew translation',async()=>{
 const mixed={id:'mixed-language',headline:'ישראל מדווחת על 5 כטב״מים',headline_ru:'Израиль сообщает о 5 беспилотниках',
  summary:'Officials described 5 drones near the border',summary_ru:null,comment:null,cached_he_hash:null};
 const {env,ai}=makeEnv({newsRows:[mixed],translate:{
  title:'ישראל מדווחת על 5 כטב״מים',body:'גורמים רשמיים תיארו 5 כטב״מים ליד הגבול',comment:'',confidence:95
 }});
 const result=await translateScheduled(env,atKind('news'));
 assert.equal(result.attempted,1,'headline language alone does not make an English body ready for HE readers');
 assert.equal(ai.length,1);
});

test('legacy pivot translations stay visible and are excluded from automatic re-translation (manual backlog)',async()=>{
 const {newsHebrewSource,legacyNewsPivotText}=await import('../../backend/editor/src/localization/shared.mjs');
 const row={headline:'Israel reports 5 drones',headline_ru:'Израиль сообщает о 5 беспилотниках',
  summary:'A statement from the border',summary_ru:'Заявление с границы',comment:null};
 const legacy=await fingerprint(legacyNewsPivotText(row)),fresh=await fingerprint(sourceText('news',row));
 assert.deepEqual(await newsHebrewSource(row,legacy),{text:legacyNewsPivotText(row),legacy:true});
 assert.deepEqual(await newsHebrewSource(row,fresh),{text:sourceText('news',row),legacy:false});
 assert.deepEqual(await newsHebrewSource(row,null),{text:sourceText('news',row),legacy:false});
 assert.equal((await newsHebrewSource({...row,headline_ru:null,summary_ru:null},legacy)).legacy,false,'no pivot, nothing legacy');
 const {env,events}=makeEnv({newsRows:[{...row,id:'legacy1',cached_he_hash:legacy,discovered_ms:Date.now()}]});
 await translateScheduled(env,atKind('news'));
 assert.equal(events.filter(e=>e.sql&&e.sql.includes('INSERT OR IGNORE INTO regional_i18n_attempts')).length,0,'legacy item is not auto re-translated');
});
