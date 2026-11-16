import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {translateScheduled} from '../../backend/editor/src/localization/scheduled.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const BASE=Date.parse('2026-11-16T10:00:00Z');
const DAY=86400000,HOUR=3600000;
const cycle=['news','analyst','story','editorial','news','profile'];
function newsNow(){
 for(let i=0;i<12;i++){
  const now=BASE+i*300000;
  if(cycle[Math.floor(now/300000)%cycle.length]==='news')return now;
 }
 throw Error('news cycle missing');
}
const NOW=newsNow();
const source='Israel and Iran discuss regional security';
const he='ישראל ואיראן דנות בביטחון האזורי';
const row=(id,priority=5,published_ms=NOW-HOUR)=>({
 id,priority,published_ms,headline:source,headline_ru:null,
 summary:'',summary_ru:null,comment:null,cached_he_hash:null
});
const event=(id,priority=5,last_seen_ms=NOW-HOUR)=>({representative_id:id,priority,last_seen_ms});

function envWith({rows=[],events=[]}={}){
 const ops=[],ai=[];
 const NEWS_DB={prepare(sql){
  const statement=(args=[])=>({
   bind(...v){return statement(v);},
   async first(){
    ops.push({kind:'first',sql,args});
    if(sql.startsWith('SELECT attempts,estimated_neurons FROM regional_i18n_budget'))
      return{attempts:0,estimated_neurons:0};
    return null;
   },
   async all(){
    ops.push({kind:'all',sql,args});
    if(sql.includes('FROM news_items')){
     const visible=sql.includes('n.id IN (SELECT g.representative_id FROM news_event_groups');
     const eligible=rows.filter(r=>{
      const high=r.priority>=7&&r.published_ms>NOW-7*DAY;
      const shown=visible&&events.some(e=>e.representative_id===r.id&&e.priority>=4&&e.last_seen_ms>NOW-36*HOUR);
      return high||shown;
     });
     return{results:eligible.sort((a,b)=>b.published_ms-a.published_ms).slice(0,120)};
    }
    return{results:[]};
   },
   async run(){
    ops.push({kind:'run',sql,args});
    return{meta:{changes:1}};
   }
  });return statement();
 }};
 const CORE_DB={prepare(sql){return{bind(){return this;},async all(){return{results:[]}},async first(){return null},async run(){return{meta:{changes:1}}}}}};
 const AI={async run(model,request){
  ai.push({model,request});
  return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({
   title:he,body:'',comment:'',confidence:95
  })}}],usage:{neurons:15}};
 }};
 return{env:{NEWS_DB,CORE_DB,AI},ops,ai};
}
const selected=ops=>ops.find(x=>x.kind==='all'&&x.sql.includes('FROM news_items'));
const claimed=ops=>ops.filter(x=>x.sql.includes('INSERT OR IGNORE INTO regional_i18n_attempts')).map(x=>x.args[1]);

test('HE translates visible current event representatives priority 4-6 and recent high-priority items',async()=>{
 const v=envWith({
  rows:[row('shown4',4,NOW-2*DAY),row('shown5',5),row('shown6',6),
        row('nonrep4',4),row('high8',8)],
  events:[event('shown4',4),event('shown5',5),event('shown6',6)]
 });
 const result=await translateScheduled(v.env,NOW);
 assert.equal(result.attempted,4,'three displayed representatives and one important item');
 assert.deepEqual(claimed(v.ops).sort(),['high8','shown4','shown5','shown6']);
 assert.equal(v.ai.length,4,'existing per-cycle HE maximum remains 4');
 const sql=selected(v.ops);
 assert.match(sql.sql,/n.id IN \(SELECT g.representative_id FROM news_event_groups/);
 assert.match(sql.sql,/g.priority>=4/);
 assert.match(sql.sql,/g.last_seen_ms>\?/);
 assert.match(sql.sql,/n.priority>=7 AND n.published_ms>\?/);
 assert.deepEqual(sql.args,[NOW-7*DAY,NOW-36*HOUR]);
 assert.match(sql.sql,/ORDER BY \(t.item_id IS NULL\) DESC,n.published_ms DESC,n.priority DESC LIMIT 120/);
});

test('HE never spends a paid attempt on stale low-signal or nonrepresentative low-priority articles',async()=>{
 const v=envWith({
  rows:[row('stale4',4),row('hidden4',4),row('held3',3)],
  events:[event('stale4',4,NOW-40*HOUR),event('held3',3)]
 });
 const result=await translateScheduled(v.env,NOW);
 assert.equal(result.attempted,0);
 assert.equal(v.ai.length,0);
 assert.deepEqual(claimed(v.ops),[]);
});
