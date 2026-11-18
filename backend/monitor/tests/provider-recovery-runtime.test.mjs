import test from 'node:test';
import assert from 'node:assert/strict';
import {runSchedule} from '../src/schedule/runner.js';

// ARCH-06: characterization of the actual modular Monitor provider scheduler.
// Historical worker/test-adsb-recovery.mjs exercised a non-production snapshot.
// No external network, production DB, credentials, cron changes or SDK mocks.
const at=(minute)=>Date.parse('2026-11-11T19:'+minute+':00Z');
function harness({failures=0,nextAllowed=0,leaseUntil=0,quota=null}={}){
 const health={failures,next_allowed_at:nextAllowed,lease_until:leaseUntil,last_error:null};
 const calls={requests:[],writes:[],batches:[],reads:[]};
 const db={
  prepare(sql){
   const statement={
    sql,params:[],
    bind(...params){this.params=params;return this;},
    async first(){
     calls.reads.push({sql,params:this.params});
     if(sql.includes('FROM worker_manual_runs'))return null;
     if(sql.includes('SELECT failures,next_allowed_at,lease_until FROM worker_provider_state'))return health;
     if(sql.includes('SELECT failures FROM worker_provider_state'))return health;
     if(sql.includes('FROM worker_provider_quota'))return quota;
     if(sql.startsWith('UPDATE worker_provider_state SET lease_until=?'))
      return {...health,lease_until:Date.now()+30000};
     if(sql.startsWith('SELECT * FROM worker_provider_state'))return health;
     throw Error('Unmocked read: '+sql);
    },
    async run(){calls.writes.push({sql,params:this.params});return {meta:{changes:1}};},
    async all(){throw Error('No manual run was requested: '+sql);}
   };
   return statement;
  },
  async batch(statements){
   calls.batches.push(statements.map(x=>({sql:x.sql,params:x.params})));
   return statements.map(()=>({success:true,meta:{changes:1}}));
  }
 };
 return {env:{DB:db},calls};
}
async function exercise(minute,options={}){
 const h=harness(options),prior=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  h.calls.requests.push(String(url));
  return Response.json({now:Math.floor(Date.now()/1000),ac:[]});
 };
 try{await runSchedule({scheduledTime:at(minute)},h.env);}
 finally{globalThis.fetch=prior;}
 return h.calls;
}
test('adsb.lol automatic cooldown causes no request, status write or source batch',async()=>{
 const out=await exercise('15',{failures:8,nextAllowed:Date.now()+3600000});
 assert.equal(out.requests.length,0);
 assert.equal(out.writes.length,0);
 assert.equal(out.batches.length,0);
});
test('a concurrent adsb.lol lease suppresses duplicate automatic traffic',async()=>{
 const out=await exercise('15',{leaseUntil:Date.now()+45000});
 assert.equal(out.requests.length,0);
 assert.equal(out.writes.length,0);
 assert.equal(out.batches.length,0);
});
test('recovery probes adsb.lol Tehran focus first even on normal context slot',async()=>{
 const out=await exercise('15',{failures:8});
 assert.deepEqual(out.requests.map(s=>new URL(s).pathname),['/v2/point/35.7/51.4/100']);
 assert.equal(out.batches.length,1,'successful recovery snapshot is still stored');
 assert.ok(out.writes.some(s=>s.sql.includes('last_status=200')),'recovery pace persisted');
});
test('healthy adsb.lol preserves existing alternating context sample',async()=>{
 const out=await exercise('15');
 assert.equal(out.requests.length,1);
 assert.notEqual(new URL(out.requests[0]).pathname,'/v2/point/35.7/51.4/100');
 assert.equal(out.batches.length,1);
});
// 18.11: holding the military query back starved mil_lol for days (adsb.lol
// 429 on shared Cloudflare egress). adsb.lol quota stays reserved for Tehran;
// the military snapshot comes from adsb.fi instead.
test('partial adsb.lol recovery sends the military query to adsb.fi, not adsb.lol',async()=>{
 const out=await exercise('04',{failures:3});
 assert.deepEqual(out.requests,['https://opendata.adsb.fi/api/v2/mil']);
 assert.equal(out.batches.length,1);
});
test('adsb.lol cooldown does not silence the military snapshot',async()=>{
 const out=await exercise('04',{failures:7,nextAllowed:Date.now()+3600000});
 assert.deepEqual(out.requests.map(s=>new URL(s).host),['opendata.adsb.fi']);
 assert.equal(out.batches.length,1);
});
test('healthy adsb.lol still polls the military endpoint on its scheduled hour',async()=>{
 const out=await exercise('04');
 assert.deepEqual(out.requests.map(s=>new URL(s).pathname),['/v2/mil']);
 assert.equal(out.batches.length,1);
});
test('healthy adsb.lol answering 429 falls back to adsb.fi in the same slot',async()=>{
 const h=harness(),prior=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  h.calls.requests.push(String(url));
  if(String(url).includes('adsb.lol'))return new Response('',{status:429});
  return Response.json({now:Date.now(),ac:[]});
 };
 try{await runSchedule({scheduledTime:at('04')},h.env);}
 finally{globalThis.fetch=prior;}
 assert.deepEqual(h.calls.requests.map(s=>new URL(s).host),['api.adsb.lol','opendata.adsb.fi']);
 assert.equal(h.calls.batches.length,1);
 assert.ok(h.calls.writes.some(w=>w.sql.includes('failures=?')&&w.params.includes(429)),'adsb.lol failure is still recorded');
});
test('shared AvioADSB quota at zero suppresses alternate sampler without a provider call',async()=>{
 const out=await exercise('22',{quota:{remaining:0,reset_at:Date.now()+3600000,checked_at:Date.now()}});
 assert.equal(out.requests.length,0);
 assert.equal(out.batches.length,1,'truthful partial coverage is recorded');
 assert.equal(out.batches[0].length,2);
 assert.ok(out.batches[0][1].params.includes('partial'));
});
test('shared AvioADSB quota reserves remaining requests for priority focus instead of airbridge',async()=>{
 const out=await exercise('37',{quota:{remaining:12,reset_at:Date.now()+3600000,checked_at:Date.now()}});
 assert.equal(out.requests.length,0);
 assert.equal(out.batches.length,1,'suppressed airbridge records degraded coverage');
 assert.ok(out.batches[0][1].params.includes('partial'));
});
test('healthy AvioADSB budget permits exactly one alternate regional request',async()=>{
 const out=await exercise('22',{quota:{remaining:50,reset_at:Date.now()+3600000,checked_at:Date.now()}});
 assert.equal(out.requests.length,1);
 assert.equal(new URL(out.requests[0]).hostname,'avioadsb.org');
 assert.equal(out.batches.length,1);
});
