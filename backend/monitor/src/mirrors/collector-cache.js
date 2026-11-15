import { get as httpGet } from '../network/http.js';

// Private D1 snapshot cache populated by controlled GitHub Actions after a
// successful Neon transaction. Never query Neon from a public page view or
// store a Neon connection string in the Worker bundle.
export const MIRROR_SOURCES=Object.freeze([
 'analysts','centcom','copernicus','gdelt','marad',
 'satellite','unosat','news_translation'
]);
const allowedSources=new Set(MIRROR_SOURCES);
const MAX_JSON_BYTES=1048576;
const ENCODER=new TextEncoder();
const HASH=/^[0-9a-f]{64}$/;
const allowedStates=new Set(['ok','partial','error','stale']);

const sortJson=value=>Array.isArray(value)?value.map(sortJson):
 value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortJson(value[k])])):value;
const canonical=value=>JSON.stringify(sortJson(value));
async function sha256(value){
 const bytes=ENCODER.encode(canonical(value));
 if(bytes.byteLength>MAX_JSON_BYTES)throw Error('snapshot exceeds cap');
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const supported=key=>{
 if(!allowedSources.has(key))throw Error('unknown collector source');
 return key;
};
const decode=(raw,label)=>{
 if(typeof raw!=='string'||ENCODER.encode(raw).byteLength>MAX_JSON_BYTES)throw Error('invalid '+label+' size');
 let value;
 try{value=JSON.parse(raw)}catch{throw Error('invalid '+label+' JSON')}
 if(!value||typeof value!=='object'||(label==='status'&&Array.isArray(value)))
  throw Error('invalid '+label+' shape');
 return value;
};

/** Internal Worker read — never expose unchecked JSON to a visitor. */
export async function readD1CollectorSnapshot(env,sourceKey){
 supported(sourceKey);
 if(!env?.DB?.prepare)throw Error('missing D1 cache binding');
 const row=await env.DB.prepare(
  'SELECT source_key,checked_at_ms,data_json,status_json,data_sha256,status_sha256 '+
  'FROM regional_collector_cache WHERE source_key=?'
 ).bind(sourceKey).first();
 if(!row)return null;
 if(row.source_key!==sourceKey)throw Error('wrong D1 collector row');
 const data=decode(row.data_json,'data');
 const status=decode(row.status_json,'status');
 if(!allowedStates.has(status.state))throw Error('invalid source status');
 const timestamp=Date.parse(status.checked_at);
 if(!Number.isFinite(timestamp)||Math.abs(timestamp-Number(row.checked_at_ms))>1)
  throw Error('inconsistent source checked_at');
 for(const [obj,digest] of [[data,row.data_sha256],[status,row.status_sha256]]){
  if(typeof digest!=='string'||!HASH.test(digest)||await sha256(obj)!==digest)
   throw Error('stored snapshot digest mismatch');
 }
 return{data,status,checkedAtMs:timestamp,origin:'neon_d1_cache'};
}

/**
 * Feature-flagged source adapter; per-source opt-in.
 * If the private D1 mirror is missing, corrupt, late, or inaccessible,
 * re-use the original two GitHub JSON URLs rather than reporting no events.
 * The collector still applies its normal freshness/error guards to either.
 */
export async function readCollectorPair(env,sourceKey,dataUrl,statusUrl,opts={}){
 supported(sourceKey);
 const enabled=String(env?.COLLECTOR_CACHE_SOURCES||'').split(',')
  .map(x=>x.trim()).includes(sourceKey);
 if(enabled){
  try{
   const cached=await readD1CollectorSnapshot(env,sourceKey);
   const now=Number.isFinite(opts.nowMs)?opts.nowMs:Date.now();
   const age=now-(cached?.checkedAtMs??0);
   const maxAge=Number.isFinite(opts.maxAgeMs)?opts.maxAgeMs:Infinity;
   if(cached&&age>=-20*60000&&age<=maxAge)return cached;
  }catch{
   // The old collector's GitHub path remains a validated fallback.
   // Do not mistake a failed mirror read for a verified empty result.
  }
 }
 const fetcher=opts.get||httpGet;
 const [data,status]=await Promise.all([fetcher(dataUrl,'json'),fetcher(statusUrl,'json')]);
 return{data,status,origin:'github'};
}
