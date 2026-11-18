import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

// H-04: one source is rolled back through D1 source_controls, without a release.
// Exercised through the real cron entrypoint; no network, no production DB.
const at=minute=>Date.parse('2026-11-11T19:'+minute+':00Z');
function harness({controls=[],controlsFail=false,manual=null}={}){
 const calls={requests:[],writes:[],batches:[],controlReads:[]};
 const db={
  prepare(sql){
   const st={sql,params:[],
    bind(...p){this.params=p;return this;},
    async first(){
     if(sql.includes('FROM worker_manual_runs'))return manual;
     if(sql.includes('FROM worker_provider_state'))return {failures:0,next_allowed_at:0,lease_until:0};
     if(sql.includes('FROM worker_provider_quota'))return null;
     if(sql.startsWith('UPDATE worker_provider_state SET lease_until=?'))return {failures:0,lease_until:Date.now()+30000};
     return null;
    },
    async run(){calls.writes.push({sql,params:this.params});return {meta:{changes:1}};},
    async all(){
     if(sql.includes('FROM source_controls')){
      calls.controlReads.push(this.params);
      if(controlsFail)throw Error('no such table: source_controls');
      return {results:controls.filter(c=>c.until_ms==null||c.until_ms>this.params[0])};
     }
     if(sql.includes('FROM source_status'))return {results:calls.batches.flat().filter(s=>s.sql.includes('source_status')).map(s=>({source:s.params[0],state:s.params[3],detail:s.params[4],attempted_at:s.params[1]}))};
     throw Error('unexpected all: '+sql);
    }};
   return st;
  },
  async batch(statements){calls.batches.push(statements.map(x=>({sql:x.sql,params:x.params})));return statements.map(()=>({meta:{changes:1}}));}
 };
 return {env:{DB:db},calls};
}
async function run(minute,opts){
 const h=harness(opts),prior=globalThis.fetch;
 globalThis.fetch=async url=>{h.calls.requests.push(String(url));return Response.json({now:Math.floor(Date.now()/1000),ac:[]});};
 try{await worker.scheduled({scheduledTime:at(minute)},h.env);}finally{globalThis.fetch=prior;}
 return h.calls;
}
const statusWrites=calls=>calls.batches.flat().filter(s=>s.sql.includes('INSERT INTO source_status'));

test('baseline: mil_lol polls its provider when nothing is disabled',async()=>{
 const out=await run('04');
 assert.equal(out.requests.length,1);
 assert.equal(out.controlReads.length,1);
});
test('a disabled source makes no upstream request and reports state=disabled with the reason',async()=>{
 const out=await run('04',{controls:[{source:'mil_lol',reason:'adsb.fi 403',until_ms:null}]});
 assert.equal(out.requests.length,0);
 const st=statusWrites(out);
 assert.equal(st.length,1);
 assert.deepEqual([st[0].params[0],st[0].params[2],st[0].params[3],st[0].params[4]],['mil_lol',null,'disabled','adsb.fi 403']);
});
test('disabling one source leaves the others in the same slot untouched',async()=>{
 const out=await run('15',{controls:[{source:'mil_lol',reason:'x',until_ms:null}]});
 assert.equal(out.requests.length,1,'adsb still polled');
 assert.equal(statusWrites(out).filter(s=>s.params[3]==='disabled').length,0);
});
test('an expired control no longer blocks the source',async()=>{
 const out=await run('04',{controls:[{source:'mil_lol',reason:'x',until_ms:Date.now()-1}]});
 assert.equal(out.requests.length,1);
});
test('control read failure fails open: sources still run',async()=>{
 const out=await run('04',{controlsFail:true});
 assert.equal(out.requests.length,1);
});
test('a manual request for a disabled source is reported as disabled, not missing_secrets, and not done',async()=>{
 const out=await run('05',{manual:{id:'m1',sources_json:'["mil_lol"]'},controls:[{source:'mil_lol',reason:'r',until_ms:null}]});
 assert.equal(out.requests.length,0);
 const fin=out.writes.find(w=>w.sql.startsWith('UPDATE worker_manual_runs SET status=?'));
 assert.equal(fin.params[0],'partial');
 const report=JSON.parse(fin.params[2]);
 assert.deepEqual(report.disabled,['mil_lol']);
 assert.deepEqual(report.missing_secrets,[]);
});
