/**
 * Private Editor read adapter for validated Neon snapshots replicated to D1.
 * CORE_DB is the existing regional-osint D1 binding shared with Monitor.
 * NEWS_DB remains the independent news/event DB and is not used for caches.
 *
 * Source flag is OFF unless explicitly set in the Editor Worker environment.
 * Callers still use their existing GitHub fallback when this returns null.
 */
const SOURCES=new Set(['analysts','news_translation']);
const TEXT_ENCODER=new TextEncoder();
const MAX_BYTES=1_048_576;
const GOOD_STATES=new Set(['ok','partial','error','stale']);
const DIGEST=/^[0-9a-f]{64}$/;
// Only fixed source/status codes enter logs; keep production diagnostics
// bounded to one warning per source/reason/hour/Worker isolate.
const lastFallbackWarning=new Map();
function reportReaderFallback(source,reason,opts){
 const event={source,reason};
 if(typeof opts.onFallback==='function'){
  try{opts.onFallback(event)}catch{ /* logger must not break the fallback */ }
  return;
 }
 const key=source+':'+reason, now=Date.now();
 if(now-(lastFallbackWarning.get(key)??-Infinity)<60*60_000)return;
 lastFallbackWarning.set(key,now);
 console.warn('regional_watch reader_fallback source='+source+' reason='+reason);
}
const invalidCacheError=err=>/digest|invalid.*(JSON|kind|size)|snapshot cap|source status|timestamp/.test(String(err?.message||''));

const canonical=x=>JSON.stringify(Array.isArray(x)?x.map(sortJson):sortJson(x));
const sortJson=x=>Array.isArray(x)?x.map(sortJson):
  x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sortJson(x[k])])):x;
const decode=(text,label)=>{
 if(typeof text!=='string'||TEXT_ENCODER.encode(text).length>MAX_BYTES)throw Error('invalid '+label+' size');
 let out;
 try{out=JSON.parse(text)}catch{throw Error('invalid '+label+' JSON')}
 if(!out||typeof out!=='object'||(label==='status'&&Array.isArray(out)))throw Error('invalid '+label+' kind');
 return out;
};
async function hash(x){
 const encoded=TEXT_ENCODER.encode(canonical(x));
 if(encoded.length>MAX_BYTES)throw Error('snapshot cap exceeded');
 const bytes=await crypto.subtle.digest('SHA-256',encoded);
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

/** Returns an authoritative pair or null to request legacy fallback. */
export async function readEditorCachedPair(env,sourceKey,opts={}){
 if(!SOURCES.has(sourceKey))throw Error('unknown collector source');
 const selected=String(env?.REGIONAL_EDITOR_CACHE_SOURCES||'').split(',').map(x=>x.trim());
 if(!selected.includes(sourceKey))return null;
 if(!env?.CORE_DB?.prepare){
  reportReaderFallback(sourceKey,'cache_unavailable',opts);
  return null;
 }
 try{
  const row=await env.CORE_DB.prepare(
   'SELECT source_key,checked_at_ms,data_json,status_json,data_sha256,status_sha256 '+
   'FROM regional_collector_cache WHERE source_key=?'
  ).bind(sourceKey).first();
  if(!row){
   reportReaderFallback(sourceKey,'cache_missing',opts);return null;
  }
  if(row.source_key!==sourceKey){
   reportReaderFallback(sourceKey,'cache_invalid',opts);return null;
  }
  const data=decode(row.data_json,'data'),status=decode(row.status_json,'status');
  if(!GOOD_STATES.has(status.state)){
   reportReaderFallback(sourceKey,'cache_invalid',opts);return null;
  }
  const checked=Date.parse(status.checked_at),stored=Number(row.checked_at_ms);
  if(!Number.isFinite(checked)||!Number.isFinite(stored)||Math.abs(checked-stored)>1){
   reportReaderFallback(sourceKey,'cache_invalid',opts);return null;
  }
  const now=Number.isFinite(opts.nowMs)?opts.nowMs:Date.now();
  const maxAge=Number.isFinite(opts.maxAgeMs)?opts.maxAgeMs:Infinity;
  if(checked>now+20*60_000||checked<now-maxAge){
   reportReaderFallback(sourceKey,'cache_stale',opts);return null;
  }
  for(const [value,expected] of [[data,row.data_sha256],[status,row.status_sha256]]){
   if(typeof expected!=='string'||!DIGEST.test(expected)||await hash(value)!==expected){
    reportReaderFallback(sourceKey,'cache_invalid',opts);return null;
   }
  }
  return {data,status,origin:'neon_d1_cache',checkedAtMs:checked};
 }catch(err){
  reportReaderFallback(sourceKey,invalidCacheError(err)?'cache_invalid':'cache_unavailable',opts);
  // Never publish unverifiable D1 as empty but healthy.
  return null;
 }
}
