import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
// Q12 (19.11): adsb.lol 429 / adsb.fi 403 on Cloudflare Worker egress, 200 from
// GitHub runners. adsb.yml / adsb-mil.yml collect there; the Monitor reads only
// the private D1 row and never calls the ADS-B providers itself.
const canonical=x=>JSON.stringify(x&&typeof x==='object'?(Array.isArray(x)?x.map(y=>JSON.parse(canonical(y))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))]))):x);
const sha=x=>createHash('sha256').update(canonical(x),'utf8').digest('hex');
function cacheRow(key,data,checkedAtMs,state='ok'){
 const status={source:key,state,checked_at:new Date(checkedAtMs).toISOString()};
 return {source_key:key,checked_at_ms:checkedAtMs,data_json:JSON.stringify(data),status_json:JSON.stringify(status),
  data_sha256:sha(data),status_sha256:sha(status)};
}
const REGIONS=[['tehran',35.7,51.4,100],['western_iran',33.1,48.4,190],['eastern_iran',33.6,58.4,260],
 ['persian_gulf',26.6,51.8,195],['hormuz',26.5,56.4,85],['gulf_of_oman',24.5,59.0,150]];
function pointData(slotMs,override={}){
 return {schema_version:1,source:'adsb',provider:'adsb.lol',collected_via:'github_actions',
  regions:REGIONS.map(([area,lat,lon,r])=>({area,lat,lon,radius_nm:Math.min(250,r),requested_radius_nm:r,
   url:'https://api.adsb.lol/v2/point/'+lat+'/'+lon+'/'+Math.min(250,r),now_ms:slotMs-5*60000,
   ac:[{hex:'4b1803',t:'A320',flight:'THY7AB'},{hex:'ae1234',t:'C17',dbFlags:1}],...(override[area]||{})}))};
}
async function cached(minute,rows,options={}){
 const h=harness(options),prior=globalThis.fetch;
 h.rows=rows;
 const first=h.env.DB.prepare;
 h.env.DB.prepare=sql=>{
  const st=first(sql);
  if(sql.includes('FROM regional_collector_cache'))st.first=async()=>rows[st.params[0]]??null;
  return st;
 };
 globalThis.fetch=async url=>{h.calls.requests.push(String(url));throw Error('ADS-B must not reach the network');};
 try{await runSchedule({scheduledTime:at(minute)},h.env);}
 finally{globalThis.fetch=prior;}
 return h.calls;
}
const statusOf=(calls,name)=>[...calls.writes,...calls.batches.flat()].find(s=>s.sql.includes('INSERT INTO source_status')&&s.params[0]===name);
const stored=(calls,name)=>calls.batches.flat().filter(s=>s.sql.includes('INSERT OR IGNORE INTO observations')&&s.params[0]===name)
 .flatMap(s=>JSON.parse(s.params[2])).map(r=>({id:r.id,...JSON.parse(r.payload)}));
const turnOf=minute=>Math.floor(at(minute)/(15*60000));

test('adsb focus slot reads the GitHub-collected cache: no provider request, sample stored',async()=>{
 const minute=turnOf('30')%2===0?'30':'45',slot=at(minute);
 const out=await cached(minute,{adsb:cacheRow('adsb',pointData(slot),slot-3*60000)});
 assert.deepEqual(out.requests,[]);
 const [sample]=stored(out,'adsb');
 assert.equal(sample.area,'tehran');
 assert.equal(sample.provider,'adsb.lol');
 assert.equal(sample.collected_via,'github_actions');
 assert.equal(sample.snapshot_at,slot-5*60000);
 assert.equal(sample.observed_aircraft,2);
 assert.equal(sample.military_db_flagged,1);
 assert.equal(sample.sampling_priority,'primary');
 assert.equal(statusOf(out,'adsb').params[3],'partial','coverage limits stay explicit');
});
test('adsb context slot keeps the alternating context rotation from the same cache',async()=>{
 const minute=turnOf('15')%2===1?'15':'30',slot=at(minute);
 const out=await cached(minute,{adsb:cacheRow('adsb',pointData(slot),slot-3*60000)});
 const [sample]=stored(out,'adsb');
 assert.notEqual(sample.area,'tehran');
 assert.equal(sample.sampling_priority,'context');
});
test('adsb.lol cooldown in worker_provider_state no longer suppresses the cached sample',async()=>{
 const slot=at('30');
 const out=await cached('30',{adsb:cacheRow('adsb',pointData(slot),slot-3*60000)},{failures:8,nextAllowed:Date.now()+3600000});
 assert.equal(stored(out,'adsb').length,1);
 assert.deepEqual(out.requests,[]);
});
test('a snapshot already used by the previous slot is reported, not stored twice',async()=>{
 const slot=at('30');
 const out=await cached('30',{adsb:cacheRow('adsb',pointData(slot),slot-16*60000)});
 assert.equal(stored(out,'adsb').length,0);
 const st=statusOf(out,'adsb');
 assert.equal(st.params[3],'error');
 assert.match(st.params[4],/no new snapshot since/);
});
test('missing cache row or a broken digest is an error, never a direct provider call',async()=>{
 const slot=at('30');
 const broken={...cacheRow('adsb',pointData(slot),slot-3*60000),data_sha256:'0'.repeat(64)};
 for(const rows of [{},{adsb:broken}]){
  const out=await cached('30',rows);
  assert.deepEqual(out.requests,[]);
  assert.equal(statusOf(out,'adsb').params[3],'error');
  assert.equal(stored(out,'adsb').length,0);
 }
});
test('a region the collector could not fetch reports the upstream error for that region',async()=>{
 const minute=turnOf('30')%2===0?'30':'45',slot=at(minute);
 const data=pointData(slot);
 const tehran=data.regions[0];
 delete tehran.ac;delete tehran.now_ms;tehran.error='HTTP 429';
 const out=await cached(minute,{adsb:cacheRow('adsb',data,slot-3*60000,'partial')});
 const st=statusOf(out,'adsb');
 assert.equal(st.params[3],'error');
 assert.equal(st.params[4],'upstream adsb.lol HTTP 429 (tehran)');
});
test('mil_lol summarizes the cached adsb.fi fallback snapshot without network',async()=>{
 const slot=at('04');
 const data={schema_version:1,source:'adsb_mil',provider:'adsb.fi',url:'https://opendata.adsb.fi/api/v2/mil',
  collected_via:'github_actions',now_ms:slot-9*60000,global_tagged_aircraft:3,
  attempts:[{provider:'adsb.lol',result:'HTTP 429'},{provider:'adsb.fi',result:'ok'}],
  ac:[{hex:'ae0001',t:'K35R',lat:29.5,lon:48.0},{hex:'ae0002',t:'C17',lat:10,lon:10},{hex:'ae0003',t:'F16',lat:31.5,lon:35.0,seen_pos:400}]};
 const out=await cached('04',{adsb_mil:cacheRow('adsb_mil',data,slot-8*60000)});
 assert.deepEqual(out.requests,[]);
 const [snap]=stored(out,'mil_lol');
 assert.equal(snap.provider,'adsb.fi');
 assert.equal(snap.global_tagged_aircraft,3);
 assert.deepEqual(snap.regional_aircraft_ids,['ae0001']);
 assert.equal(snap.stale_positions_global,1);
 assert.equal(snap.areas.persian_gulf.observed_aircraft,1);
 assert.equal(statusOf(out,'mil_lol').params[3],'ok');
});
test('mil_lol reports both failed providers when the collector got nothing',async()=>{
 const slot=at('04');
 const data={schema_version:1,source:'adsb_mil',provider:null,url:null,collected_via:'github_actions',now_ms:null,
  global_tagged_aircraft:0,ac:[],attempts:[{provider:'adsb.lol',result:'HTTP 429'},{provider:'adsb.fi',result:'HTTP 403'}]};
 const out=await cached('04',{adsb_mil:cacheRow('adsb_mil',data,slot-8*60000,'error')});
 const st=statusOf(out,'mil_lol');
 assert.equal(st.params[3],'error');
 assert.match(st.params[4],/adsb\.lol HTTP 429; adsb\.fi HTTP 403/);
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
