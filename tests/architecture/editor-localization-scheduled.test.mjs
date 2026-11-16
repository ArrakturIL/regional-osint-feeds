import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
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

test('post-split facade + scheduled + shared reconstruct exact original GitHub blob',()=>{
 const root=new URL('../../backend/editor/src/localization/',import.meta.url);
 const main=readFileSync(new URL('localization.mjs',root),'utf8');
 const shared=readFileSync(new URL('shared.mjs',root),'utf8');
 const scheduled=readFileSync(new URL('scheduled.mjs',root),'utf8');
 const extra="import {DAY,val,sourceText,fingerprint} from './shared.mjs';\n"
   +"import {translateScheduled} from './scheduled.mjs';\n"
   +"export {fingerprint} from './shared.mjs';\n";
 assert.ok(main.includes(extra),'facade imports shared and scheduled exports');
 assert.ok(shared.includes("export const DAY=86400000;\n"));
 const valStart=shared.indexOf('export function val(');
 const sourceStart=shared.indexOf('export function sourceText(');
 const fingerprintStart=shared.indexOf('export async function fingerprint(');
 const scheduledStart=scheduled.indexOf("const HE_MODEL='@cf/zai-org/glm-4.7-flash';");
 assert.ok(valStart>0&&sourceStart>valStart&&fingerprintStart>sourceStart&&scheduledStart>0,
   'all original localization stage boundaries still present');
 const valuePart=shared.slice(valStart,sourceStart).replace('export function val(','function val(');
 const sourcePart=shared.slice(sourceStart,fingerprintStart).replace('export function sourceText(','function sourceText(');
 const hashPart=shared.slice(fingerprintStart);
 const restored=main.replace(extra,'')
   .replace('function respond(body,code=200)',"const DAY=86400000;\nfunction respond(body,code=200)")
   .replace('// Field metadata describes displayed text',valuePart+'// Field metadata describes displayed text')
   .replace('async function localized(db,kind,id,original,lang,prefilled=null){',
     sourcePart+hashPart+'async function localized(db,kind,id,original,lang,prefilled=null){')
   .replace('export default {fetch:fetchLocalized,scheduled:translateScheduled};',
     scheduled.slice(scheduledStart)+'export default {fetch:fetchLocalized,scheduled:translateScheduled};');
 const bytes=Buffer.from(restored,'utf8');
 const got=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\\0','utf8')).update(bytes).digest('hex');
 assert.equal(got,'5b907775613eec9c1a986eddcd06cb74fd7c9880',
   'no changes to RU/HE API, GLM-4.7 prompts, SQL, budgets or translation guards');
});

test('shared source text and fingerprint retain public identity and never fabricate missing comments',async()=>{
 const row={headline:'Israel reports 5 drones',headline_ru:'Израиль сообщает о 5 беспилотниках',
  summary:'A statement from the border',summary_ru:'Заявление с границы',comment:null};
 const original=sourceText('news',row);
 assert.deepEqual(original,{title:'Израиль сообщает о 5 беспилотниках',body:'Заявление с границы',comment:''});
 assert.equal(await fingerprint(original),await publicFingerprint(original));
 assert.match(await fingerprint(original),/^[a-f0-9]{64}$/);
});

test('daily Hebrew quotas block selection and AI before source queries at 96 attempts or 4000 neurons',async()=>{
 for(const budget of [{attempts:96,estimated_neurons:0},{attempts:0,estimated_neurons:4000}]){
  const {env,events,ai}=makeEnv({budget});
  const result=await translateScheduled(env,atKind('news'));
  assert.deepEqual(result,{state:'budget'});
  assert.equal(ai.length,0);
  assert.equal(events.filter(e=>e.method==='all').length,0,'quota check precedes source scanning');
  assert.equal(writes(events,'INSERT OR IGNORE INTO regional_i18n_budget').length,1);
  assert.equal(writes(events,'last_he_localization').length,0);
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
 assert.equal(result.state,'ok');
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
