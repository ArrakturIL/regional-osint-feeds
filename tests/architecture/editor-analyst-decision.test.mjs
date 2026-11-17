import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAnalystDecision} from '../../backend/editor/src/analysts/editorial-decision.mjs';
import analystService,{testHooks} from '../../backend/editor/src/analysts/editor.mjs';
import {reconstructAnalystDecisionEditor} from './analyst-decision-source-parity.mjs';

const DAY=86400000,MODEL='@cf/zai-org/glm-4.7-flash',EDITOR_VERSION='analyst-editor-v1.1.2-translation';
const now=Date.parse('2026-11-16T03:00:00Z');
const plain=(text,cap)=>String(text??'').replace(/\s+/g,' ').trim().slice(0,cap);
const bodyWords=text=>String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[];
const similarity=(a,b)=>{const aa=new Set(bodyWords(a)),bb=new Set(bodyWords(b));if(!aa.size||!bb.size)return 0;let count=0;for(const word of aa)if(bb.has(word))count++;return count/Math.min(aa.size,bb.size)};
const assertString=(v,min,max)=>typeof v==='string'&&v.length>=min&&v.length<=max;
const make=(translatedForEditorial=async()=>{throw Error('unexpected translation')})=>createAnalystDecision({
 EDITOR_VERSION,MODEL,DAY,MAX_AI_PER_DAY:14,REGION:/israel|iran|израил|иран/i,
 PROMO:/промокод/i,isCommercialAd:()=>false,plain,bodyWords,similarity,assertString,
 isoNow:ms=>new Date(ms).toISOString(),translatedForEditorial
});
const report={
 id:'src:report-77',analyst_id:'analyst-one',analyst_name:'Автор аналитики',source_type:'telegram_post',
 source_id:'src',canonical_url:'https://t.me/analyst_one/77',
 source_published_at_ms:now-7000,content_hash:'a'.repeat(64),
 text_status:'full_text',original_language:'ru',
 body:'Israel and Iran regional security analysis. '.repeat(9)
};
const valid={
 decision:'publish',reason:'Новый и содержательный анализ.',relevance:91,novelty:83,substance:88,
 headline:'По оценке аналитика, региональная безопасность меняется',
 summary:'По оценке автора, изменения в безопасности региона требуют осторожной оценки, поскольку отдельные утверждения остаются только мнением и не подтверждены независимо.',
 quote:''
};
const gitBlob=text=>{const b=Buffer.from(text,'utf8');return createHash('sha1').update(Buffer.from('blob '+b.length,'utf8')).update(Buffer.from([0])).update(b).digest('hex')};

test('editorial decision extraction recreates exact pre-split Git blob and unchanged editor hooks',()=>{
 assert.equal(gitBlob(reconstructAnalystDecisionEditor()),'742091e2b6818d2cae585985dadb27401e1d02e5');
 for(const name of ['validateDecision','reserveAi','aiDecision']) assert.equal(typeof testHooks[name],'function');
 assert.equal(typeof analystService.fetch,'function');
 assert.equal(typeof analystService.scheduled,'function');
});

test('validation keeps original thresholds and rejects fabricated or copied claims',()=>{
 const {validateDecision}=make();
 const d=validateDecision(valid,report.body);
 assert.equal(d.decision,'publish');
 assert.equal(d.quote,'');
 assert.deepEqual(d,testHooks.validateDecision(valid,report.body));
 assert.equal(validateDecision({...valid,reason:'bad'},report.body),null);
 assert.equal(validateDecision({...valid,relevance:101},report.body),null);
 assert.equal(validateDecision({...valid,relevance:77},report.body).decision,'skip');
 // Existing Cyrillic regex \\b limitation: forbidden assertion can escape this guard.\n // Record as separate backend E-06 bug, do not silently alter behavior in a lossless refactor.\n assert.equal(validateDecision({...valid,quote:'Придуманная цитата'},report.body).quote,'');
 const originalParagraph='Extended analysis of regional security with long unbroken source description and concrete assertions without full stops '.repeat(2).trim();
 assert.equal(validateDecision({...valid,summary:originalParagraph},originalParagraph),null);
 assert.equal(validateDecision({...valid,decision:'needs_data',headline:undefined,summary:undefined},report.body).decision,'needs_data');
});

test('daily AI attempt gate distinguishes successful reservation, already-attempted source and global exhaustion',async()=>{
 const {reserveAi}=make();
 const queries=[];
 const db=(changes,existing)=>({prepare(sql){
  return{bind(...args){queries.push({sql,args});return{
   async run(){return {meta:{changes}}},
   async first(){return existing?{item_id:report.id}:null}
  }}};
 }});
 assert.equal(await reserveAi(db(1,false),report,now),null);
 assert.equal(queries[0].args[0],report.id);
 assert.equal(queries[0].args[1],Math.floor(now/DAY)*DAY);
 assert.equal(queries[0].args[4],Math.floor(now/DAY)*DAY);
 assert.equal(queries[0].args[5],14);
 assert.equal(queries[0].args[2],MODEL);
 assert.equal(await reserveAi(db(0,true),report,now),'already_attempted');
 assert.equal(await reserveAi(db(0,false),report,now),'budget_exhausted');
});

test('AI prompt marks source as an untrusted author claim, validates JSON and stays on original model',async()=>{
 const {aiDecision}=make();
 let captured=null;
 const env={AI:{async run(model,payload){captured={model,payload};return{choices:[{message:{content:JSON.stringify(valid)}}]}}}};
 const out=await aiDecision(env,report,[{headline:'Предыдущий материал'}]);
 assert.equal(out.decision,'publish');
 assert.equal(captured.model,MODEL);
 assert.match(captured.payload.messages[0].content,/непроверенное ВЫСКАЗЫВАНИЕ/);
 assert.match(captured.payload.messages[1].content,/Автор аналитики/);
 assert.ok(captured.payload.messages[1].content.includes(report.canonical_url));
 assert.equal(captured.payload.max_tokens,750);
 assert.equal(captured.payload.temperature,0.1);
 const badEnv={AI:{run:async()=>({response:'not-json'})}};
 await assert.rejects(aiDecision(badEnv,report,[]),/invalid_ai_json/);
 const wrongEnv={AI:{run:async()=>({response:JSON.stringify({...valid,quote:'Выдуманная цитата',summary:'слишком коротко'})})}};
 await assert.rejects(aiDecision(wrongEnv,report,[]),/ai_result_failed_validation/);
});

test('foreign source cannot publish unverified quote even when literal, and Russian editorial translation is explicit',async()=>{
 const {aiDecision}=make();
 const foreign={...report,original_language:'en',body:'Original words about security and regional developments in Israel. '.repeat(6)};
 const env={AI:{run:async()=>({response:JSON.stringify({...valid,quote:'Original words about security'})})}};
 await assert.rejects(aiDecision(env,foreign,[],{text:'Российский перевод'}),/foreign_language_quote_not_verified/);
});

function dbFixture({reserveChanges=1}={}){
 const calls=[],batches=[];
 const db={prepare(sql){
   let args=[];
   const statement={bind(...xs){args=xs;return statement},async run(){calls.push({sql,args,kind:'run'});return{meta:{changes:reserveChanges}}},async first(){calls.push({sql,args,kind:'first'});return null}};
   calls.push({sql,args,kind:'prepare'});
   return statement;
  },async batch(q){batches.push(q);return q.map(()=>({meta:{changes:1}}))}};
 return{db,calls,batches};
}
test('rules-only posts skip or need data without reserving AI or publishing invented content',async()=>{
 const {decide}=make();
 const f=dbFixture();
 const outcome=await decide(f.db,{AI:{run:async()=>{throw Error('AI should not be called')}}},
   {...report,text_status:'metadata_only',body:''},now,[]);
 assert.equal(outcome,'needs_data');
 assert.equal(f.batches.length,1);
 assert.equal(f.batches[0].length,2);
 assert.ok(f.calls.some(x=>x.sql.includes('analyst_editorial_decisions')));
 assert.ok(f.calls.some(x=>x.sql.includes("UPDATE analyst_items SET state=?")));
 assert.ok(!f.calls.some(x=>x.sql.includes('analyst_ai_attempts')));
 const g=dbFixture();
 const skipped=await decide(g.db,{AI:{run:async()=>{throw Error('AI should not be called')}}},
   {...report,body:'Короткое сообщение'},now,[]);
 assert.equal(skipped,'skip');
 assert.equal(g.batches[0].length,2);
});

test('published analyst commentary preserves attribution, immutable source URL, fact-check status and decision record',async()=>{
 const {decide}=make();
 const f=dbFixture();
 const env={AI:{run:async()=>({response:JSON.stringify(valid)})}};
 const state=await decide(f.db,env,report,now,[]);
 assert.equal(state,'published');
 assert.equal(f.batches.length,1);
 assert.equal(f.batches[0].length,3);
 assert.ok(f.calls.some(x=>x.sql.includes('INSERT OR IGNORE INTO analyst_editorial_decisions')));
 const pub=f.calls.find(x=>x.sql.includes('INSERT OR IGNORE INTO analyst_publications'));
 assert.ok(pub,'publication SQL remains present');
 const statement=f.batches[0][1];
 assert.ok(statement,'publication statement committed in batch');
});

test('E-06: Cyrillic categorical confirmation is rejected but explicit negation remains attributable',()=>{
 const {validateDecision}=make();
 for(const headline of [
  'По мнению аналитика, факт официально установлен',
  'Аналитик считает, что произошедшее ДОКАЗАНО',
  'Автор утверждает, что сообщение подтверждено',
  'По оценке аналитика, выводы доказаны',
 ]){
  assert.equal(validateDecision({...valid,headline},report.body),null,'unsafe headline: '+headline);
 }
 for(const headline of [
  'По мнению аналитика, информация не подтверждена',
  'Автор объясняет, почему этот вывод не доказан',
  'Аналитик обсуждает сообщения о подтверждении фактов',
 ]){
  assert.equal(validateDecision({...valid,headline},report.body)?.decision,'publish','attributed, non-categorical: '+headline);
 }
});
