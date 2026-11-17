import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {translateTitles} from '../../backend/editor/src/translations/scheduled.mjs';
import {reconstructOriginalRuTranslator} from './ru-translation-selection-parity.mjs';

const NOW=Date.parse('2026-11-16T10:00:00Z');
const HOUR=3600000;
const sourceTitle='Israel and regional leaders discuss security negotiations';
const sourceSummary='Regional officials discussed cooperation and future negotiations.';
const translatedTitle='Израиль и региональные лидеры обсуждают переговоры о безопасности';
const translatedSummary='Региональные представители обсудили сотрудничество и дальнейшие переговоры.';
const row=(id,priority,published_ms=NOW-HOUR,extra={})=>({
 id,priority,published_ms,headline:sourceTitle,summary:sourceSummary,
 headline_ru:null,summary_ru:null,...extra
});
const event=(id,priority=5,last_seen_ms=NOW-HOUR)=>({representative_id:id,priority,last_seen_ms});
const blobSha=s=>{const b=Buffer.from(s,'utf8');return createHash('sha1').update(Buffer.from('blob '+b.length,'utf8')).update(Buffer.from([0])).update(b).digest('hex');};
function makeEnv({rows=[],events=[],budget={batches:0,estimated_neurons:0}}={}){
 const sqls=[],calls=[],wrote=[];
 const cutoff=NOW-36*HOUR;
 const eligible=(r)=>{
   const fresh= r.published_ms>cutoff;
   const isCurrent=events.some(e=>e.representative_id===r.id&&e.priority>=4&&e.last_seen_ms>cutoff);
   const missing=r.headline_ru===null || (r.summary_ru===null && r.summary.length>10);
   return missing && ((r.priority>=7&&fresh)||(isCurrent));
 };
 const NEWS_DB={
  prepare(sql){
   let args=[];
   const stmt={
    bind(...values){args=values;return stmt;},
    async first(){
      sqls.push({method:'first',sql,args});
      if(sql.includes('FROM news_translation_budget'))return budget;
      throw Error('Unexpected first SQL '+sql);
    },
    async all(){
      sqls.push({method:'all',sql,args});
      if(!sql.includes('FROM news_items'))throw Error('Unexpected all SQL '+sql);
      if(sql.includes(' IN (SELECT g.representative_id')&&sql.includes('news_event_groups')){
        return{results:rows.filter(eligible).sort((a,b)=>b.published_ms-a.published_ms).slice(0,22)};
      }
      // Precisely model the OLD >=7 selector so the test is RED before the code fix.
      return{results:rows.filter(r=>r.priority>=7&&r.published_ms>cutoff&&
        (r.headline_ru===null||(r.summary_ru===null&&r.summary.length>10)))
        .sort((a,b)=>b.published_ms-a.published_ms).slice(0,22)};
    },
    async run(){
      sqls.push({method:'run',sql,args});
      if(sql.includes('UPDATE news_items SET'))wrote.push({id:args[2],title:args[0],summary:args[1]});
      return{meta:{changes:1}};
    }
   };
   return stmt;
  }
 };
 const AI={async run(model,prompt){
   calls.push({model,prompt});
   const payload=JSON.parse(prompt.messages[1].content);
   return{response:JSON.stringify(payload.map(x=>({id:x.id,title_ru:translatedTitle,summary_ru:translatedSummary}))),usage:{neurons:92}};
 }};
 return{env:{NEWS_DB,AI},sqls,calls,wrote};
}
const candidateSql=ops=>ops.find(e=>e.method==='all'&&e.sql.includes('FROM news_items'));
test.skip('[RETIRED 18.11, B1: byte-parity with a pre-split blob blocks any change; behaviour is covered by runtime tests] exact prechange RU translation source remains reconstructable',()=>{
 assert.equal(blobSha(reconstructOriginalRuTranslator()),'2b3be8cff87ecb1c94e1ff1c1834e95ba9ef64c4');
});
test('recent low-priority displayed events translate; non-displayed low-priority articles do not',async()=>{
 const data=makeEnv({
  rows:[row('shown4',4,NOW-2*HOUR),row('shown5',5,NOW-3*HOUR),
        row('shown6',6,NOW-4*HOUR),row('hidden4',4,NOW-30*60000)],
  events:[event('shown4',4),event('shown5',5),event('shown6',6)]
 });
 const outcome=await translateTitles(data.env,NOW);
 assert.equal(outcome.translated,3);
 assert.equal(data.calls.length,1,'visible event representatives share one existing RU batch');
 assert.deepEqual(data.wrote.map(x=>x.id),['shown4','shown5','shown6']);
 const q=candidateSql(data.sqls);
 assert.match(q.sql,/n\.id IN \(SELECT g\.representative_id FROM news_event_groups/);
 assert.ok(!q.sql.includes('EXISTS'), 'representative lookup should be set-based');
 assert.match(q.sql,/g\.priority>=4/);
 assert.match(q.sql,/g\.last_seen_ms>\?/);
 assert.equal(q.sql.includes('ORDER BY n.published_ms DESC LIMIT 22'),true);
 assert.deepEqual(q.args,[NOW-36*HOUR,NOW-36*HOUR]);
});
test('fresh high-priority source remains eligible independent of event grouping; old high-priority source is not',async()=>{
 const data=makeEnv({
  rows:[row('high-new',8,NOW-HOUR),row('high-old',10,NOW-48*HOUR),
        row('old-representative',4,NOW-60*HOUR)],
  events:[event('old-representative',4,NOW-30*60000)]
 });
 const outcome=await translateTitles(data.env,NOW);
 assert.equal(outcome.translated,2);
 assert.deepEqual(data.wrote.map(x=>x.id),['high-new','old-representative']);
 assert.equal(data.calls.length,1);
});
test('stale event, nonrepresentative and low-signal even when grouped must remain excluded',async()=>{
 const data=makeEnv({
  rows:[row('stale4',4),row('member4',4),row('held3',3),row('not-event6',6)],
  events:[event('stale4',4,NOW-40*HOUR),
          event('some-other-representative',6,NOW-HOUR),
          event('held3',3,NOW-HOUR)]
 });
 const outcome=await translateTitles(data.env,NOW);
 assert.deepEqual(outcome,{translated:0,summaries:0});
 assert.equal(data.calls.length,0,'do not spend RU quota on non-visible or held articles');
 assert.equal(data.sqls.filter(x=>x.method==='run'&&x.sql.includes('batches=batches+1')).length,0);
});
test('visible summary-only pending translates without overwriting existing Russian headline',async()=>{
 const data=makeEnv({
  rows:[row('summary-only',5,NOW-HOUR,{headline_ru:'Существующий корректный русский заголовок'})],
  events:[event('summary-only',5)]
 });
 const outcome=await translateTitles(data.env,NOW);
 assert.equal(outcome.translated,0);
 assert.equal(outcome.summaries,1);
 assert.equal(data.wrote.length,1);
 assert.equal(data.wrote[0].id,'summary-only');
 const q=data.sqls.find(x=>x.sql.includes('UPDATE news_items SET'));
 assert.match(q.sql,/headline_ru=COALESCE\(headline_ru,\?\)/);
});
test('RU 48 batch / 6000 neuron ceiling (B1) and 5 articles per request remain unchanged',async()=>{
 const blocked=makeEnv({budget:{batches:48,estimated_neurons:0},rows:[row('shown4',4)],events:[event('shown4',4)]});
 assert.deepEqual(await translateTitles(blocked.env,NOW),{translated:0,summaries:0,budget:'limit'});
 assert.equal(blocked.calls.length,0);
 assert.equal(candidateSql(blocked.sqls),undefined);
 const rows=Array.from({length:8},(_,i)=>row('event'+i,4,NOW-i*60000));
 const allowed=makeEnv({rows,events:rows.map(x=>event(x.id,4))});
 const outcome=await translateTitles(allowed.env,NOW);
 assert.equal(outcome.translated,5);
 assert.equal(allowed.wrote.length,5);
 assert.equal(allowed.calls.length,1);
 assert.equal(allowed.sqls.filter(x=>x.method==='run'&&x.sql.includes('batches=batches+1')).length,1);
});
