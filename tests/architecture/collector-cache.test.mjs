import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readCollectorPair,readD1CollectorSnapshot} from '../../backend/monitor/src/mirrors/collector-cache.js';

const at=Date.parse('2026-11-15T12:00:00Z');
const data={source:'gdelt_context',latest_batch:'20261115120000',sample:[]};
const status={source:'gdelt_context',state:'ok',checked_at:new Date(at).toISOString()};
const canonical=x=>JSON.stringify(x&&typeof x==='object'?(Array.isArray(x)?x.map(y=>JSON.parse(canonical(y))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))]))):x);
const hash=x=>createHash('sha256').update(canonical(x),'utf8').digest('hex');
const row=()=>({source_key:'gdelt',data_json:JSON.stringify(data),status_json:JSON.stringify(status),
  checked_at_ms:at,data_sha256:hash(data),status_sha256:hash(status)});
function fixtureEnv(stored,enabled='gdelt'){
 const calls={sql:[],sources:[],requests:[]};
 const db={prepare(sql){calls.sql.push(sql);return{bind(key){calls.sources.push(key);return{first:async()=>stored}}}}};
 return {env:{DB:db,COLLECTOR_CACHE_SOURCES:enabled},calls};
}
function fetcher(calls){
 return async url=>{calls.requests.push(url);return url.endsWith('-status.json')?status:data};
}
const dataUrl='https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/gdelt-context.json';
const statusUrl='https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/gdelt-status.json';
const read=(env,get,options={})=>readCollectorPair(env,'gdelt',dataUrl,statusUrl,{get,nowMs:at+60000,...options});

test('flag off reads legacy GitHub pair and does not query D1',async()=>{
 const {env,calls}=fixtureEnv(row(),'');
 const result=await read(env,fetcher(calls));
 assert.equal(result.origin,'github');
 assert.equal(calls.sql.length,0);
 assert.equal(calls.requests.length,2);
 assert.deepEqual(result.data,data);
 assert.deepEqual(result.status,status);
});

test('enabled valid cached Neon row returns intact pair with no GitHub requests',async()=>{
 const {env,calls}=fixtureEnv(row());
 const result=await read(env,fetcher(calls));
 assert.equal(result.origin,'neon_d1_cache');
 assert.deepEqual(result.data,data);
 assert.deepEqual(result.status,status);
 assert.deepEqual(calls.sources,['gdelt']);
 assert.deepEqual(calls.requests,[]);
});

test('modified D1 JSON with unchanged digest fails closed to legacy',async()=>{
 const corrupt={...row(),data_json:JSON.stringify({...data,sample:['fabricated']})};
 const {env,calls}=fixtureEnv(corrupt);
 const result=await read(env,fetcher(calls));
 assert.equal(result.origin,'github');
 assert.equal(calls.requests.length,2);
});

test('status timestamp mismatch fails closed to legacy',async()=>{
 const inconsistent={...row(),checked_at_ms:at-3600000};
 const {env,calls}=fixtureEnv(inconsistent);
 const result=await read(env,fetcher(calls));
 assert.equal(result.origin,'github');
 assert.equal(calls.requests.length,2);
});

test('missing row, missing DB, or D1 error falls back without presenting no activity',async()=>{
 for(const dbRow of [null,{...row(),data_json:'not json'}]){
  const {env,calls}=fixtureEnv(dbRow);
  const res=await read(env,fetcher(calls));
  assert.equal(res.origin,'github');
  assert.equal(calls.requests.length,2);
 }
 const calls={requests:[]};
 const noDb={COLLECTOR_CACHE_SOURCES:'gdelt'};
 assert.equal((await read(noDb,fetcher(calls))).origin,'github');
 assert.equal(calls.requests.length,2);
});

test('stale D1 row falls back to fresh legacy, never masquerades as current',async()=>{
 const {env,calls}=fixtureEnv(row());
 const result=await read(env,fetcher(calls),{nowMs:at+7*3600000,maxAgeMs:4*3600000});
 assert.equal(result.origin,'github');
 assert.equal(calls.requests.length,2);
});

test('stored error status is retained, never converted into an empty healthy snapshot',async()=>{
 const badStatus={...status,state:'error'};
 const r={...row(),status_json:JSON.stringify(badStatus),status_sha256:hash(badStatus)};
 const {env,calls}=fixtureEnv(r);
 const res=await read(env,fetcher(calls));
 assert.equal(res.origin,'neon_d1_cache');
 assert.equal(res.status.state,'error');
});

test('invalid source keys never reach SQL and invalid hashes are rejected',async()=>{
 const {env,calls}=fixtureEnv(row());
 await assert.rejects(readCollectorPair(env,'../../keys',dataUrl,statusUrl,{get:fetcher(calls)}),/unknown collector/);
 assert.equal(calls.sql.length,0);
 const r={...row(),data_sha256:'0'.repeat(64)};
 await assert.rejects(readD1CollectorSnapshot({...env,DB:{prepare:()=>({bind:()=>({first:async()=>r})})}},'gdelt'),/digest/i);
});

test('D1 lookup does not require a Neon connection string in Cloudflare Worker',async()=>{
 const {env,calls}=fixtureEnv(row());
 assert.equal(env.NEON_DATABASE_URL,undefined);
 assert.deepEqual((await readD1CollectorSnapshot(env,'gdelt')).data,data);
 assert.equal(calls.sql.length,1);
});
