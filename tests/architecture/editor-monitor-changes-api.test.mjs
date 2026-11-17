import test from 'node:test';
import assert from 'node:assert/strict';
import editor from '../../backend/editor/src/index.js';
import {buildDigest,readMonitorChanges} from '../../backend/editor/src/api/monitor-changes.mjs';

const NOW=Date.parse('2026-11-16T00:45:00Z');
const PREV=NOW-5*60*1000;
const runs=[
 {run_id:'latest',started_at_ms:NOW,outcome:'watch',payload:JSON.stringify({source_maxima_ms:{adsb:200,ais:50}})},
 {run_id:'previous',started_at_ms:PREV,outcome:'quiet',payload:JSON.stringify({source_maxima_ms:{adsb:100,ais:50}})}
];
const fixture=(rows=runs,events=[],error=null)=>{
 const calls=[],env={CORE_DB:{prepare(sql){
  const statement={
   args:[],bind(...args){this.args=args;return this;},
   async all(){calls.push({sql,args:this.args});if(error)throw error;return{results:sql.includes('monitor_runs')?rows:events}},
   async run(){throw Error('monitor changes API must remain read-only')},
   async first(){throw Error('monitor changes API must not call first()')}
  };
  return statement;
 }}};
 return{env,calls};
};
const request=(query='',init)=>new Request('https://regional-watch.example/api/changes'+query,init);
const get=async(res)=>({status:res.status,headers:res.headers,json:res.status===204?null:await res.json()});

test('source comparison counts updates and returns only bounded journal updates',()=>{
 const events=[
  {event_id:'good',updated_at_ms:PREV+1000},
  {event_id:'stale',updated_at_ms:PREV},
  {event_id:'future',updated_at_ms:NOW+1}
 ];
 const result=buildDigest(runs,events);
 assert.equal(result.status,'ready');
 assert.equal(result.periodMinutes,5);
 assert.equal(result.sourceComparable,2);
 assert.equal(result.sourceUpdates,1);
 assert.equal(result.outcome,'watch');
 assert.equal(result.previousOutcome,'quiet');
 assert.deepEqual(result.changes.map(x=>x.kind),['assessment_changed','journal_updated']);
 assert.equal(result.changes[1].story_id,'good');
 assert.equal(result.changes[1].description,'Поступило обновление записи; само по себе это не подтверждает утверждения источников.');
 assert.equal(result.changes[1].description_he,'עודכנה רשומת המעקב; העדכון עצמו אינו מאמת טענות של מקורות.');
 assert.equal(result.changes[1].time,new Date(PREV+1000).toISOString());
});

test('pending and insufficient comparison are not fabricated as verified activity',()=>{
 const empty=buildDigest([],[]);
 assert.equal(empty.status,'pending');
 assert.deepEqual(empty.changes,[]);
 assert.equal(empty.lastCheck,null);
 const single=buildDigest([runs[0]],[]);
 assert.equal(single.status,'pending');
 assert.equal(single.lastCheck,new Date(NOW).toISOString());
 assert.equal(single.previousCheck,null);
 const unmatched=[{...runs[0],outcome:'quiet',payload:'{invalid'},runs[1]];
 const out=buildDigest(unmatched,[]);
 assert.equal(out.status,'insufficient_comparison');
 assert.deepEqual(out.changes,[]);
 assert.equal(out.sourceComparable,0);
 assert.equal(out.sourceUpdates,0);
});

test('same/out-of-order run timestamps return explicit error rather than fictitious comparison',()=>{
 const invalid=buildDigest([{...runs[0],started_at_ms:PREV},runs[1]],[]);
 assert.deepEqual(invalid,{status:'error',changes:[],error:'invalid_monitor_run_times'});
});

test('method and language validation are read-only and preserve public headers',async()=>{
 const {env,calls}=fixture();
 const preflight=await get(await readMonitorChanges(request('',{method:'OPTIONS'}),env));
 assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get('Access-Control-Allow-Methods'),'GET,OPTIONS');
 const badMethod=await get(await readMonitorChanges(request('',{method:'POST'}),env));
 assert.equal(badMethod.status,405);
 assert.deepEqual(badMethod.json,{error:'method_not_allowed'});
 const badLang=await get(await readMonitorChanges(request('?lang=fr'),env));
 assert.equal(badLang.status,400);
 assert.deepEqual(badLang.json,{error:'unsupported_language'});
 assert.equal(badLang.headers.get('Cache-Control'),'no-store');
 assert.equal(badLang.headers.get('Access-Control-Allow-Origin'),'*');
 assert.equal(calls.length,0);
});

test('GET /api/changes retains two read-only queries and exact bilingual metadata',async()=>{
 const {env,calls}=fixture(runs,[{event_id:'update',updated_at_ms:PREV+2000}]);
 const out=await get(await readMonitorChanges(request('?lang=he'),env));
 assert.equal(out.status,200);
 assert.equal(out.json.requested_language,'he');
 assert.equal(out.json.status,'ready');
 assert.equal(out.json.lastCheck,new Date(NOW).toISOString());
 assert.equal(out.json.previousCheck,new Date(PREV).toISOString());
 assert.equal(out.json.sourceComparable,2);
 assert.equal(out.json.sourceUpdates,1);
 assert.equal(out.json.changes[0].title_he,'השתנתה הערכת המעקב');
 assert.equal(out.json.changes[1].title_he,'עודכן תיק מעקב');
 assert.deepEqual(calls.map(x=>x.sql.includes('monitor_runs')?'runs':'events'),['runs','events']);
 assert.deepEqual(calls[1].args,[PREV,NOW]);
 assert.match(calls[1].sql,/LIMIT 6/);
});

test('database query failure is explicit 503 without leaking SQL or provider secrets',async()=>{
 const {env}=fixture(runs,[],new Error('private database credential failure'));
 const res=await get(await readMonitorChanges(request('?lang=ru'),env));
 assert.equal(res.status,503);
 assert.deepEqual(res.json,{error:'digest_unavailable',message:'monitor_comparison_not_available'});
});

test('real Editor fetch router still exposes monitor comparison at /api/changes',async()=>{
 const {env}=fixture();
 const res=await get(await editor.fetch(request('?lang=ru'),env));
 assert.equal(res.status,200);
 assert.equal(res.json.requested_language,'ru');
 assert.equal(res.json.sourceUpdates,1);
});


test('C-04 exposes exact comparable source changes and reasons for missing coverage without certifying incidents',()=>{
 const now=NOW,prev=PREV;
 const curr={run_id:'c',started_at_ms:now,outcome:'quiet',payload:JSON.stringify({source_maxima_ms:{adsb:240,ais:50,satellite:null,new_only:120}})};
 const old={run_id:'p',started_at_ms:prev,outcome:'quiet',payload:JSON.stringify({source_maxima_ms:{adsb:100,ais:50,satellite:160,lost:180}})};
 const out=buildDigest([curr,old],[]);
 assert.equal(out.status,'ready');
 assert.equal(out.sourceComparable,2);
 assert.equal(out.sourceUpdates,1);
 assert.deepEqual(out.sourceChanges,[{source:'adsb',from_ms:100,to_ms:240,kind:'source_timestamp_advanced'}]);
 assert.deepEqual(out.sourceGaps,[
  {source:'lost',reason:'missing_latest_snapshot'},
  {source:'new_only',reason:'missing_previous_snapshot'},
  {source:'satellite',reason:'invalid_latest_timestamp'}
 ]);
 assert.equal(out.independentPrimarySources,null,'source count is not independent fact verification');
 assert.equal(out.lastCheck,new Date(now).toISOString());
 assert.deepEqual(out.changes,[],'a source cursor advancing cannot certify a new incident');
});
