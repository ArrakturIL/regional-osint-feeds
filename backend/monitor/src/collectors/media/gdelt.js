import { json } from '../../api/json.js';
import { HOUR, MINUTE } from '../../config/constants.js';
import { readCollectorPair } from '../../mirrors/collector-cache.js';
import { item } from '../../observations/item.js';
import { sources } from '../../schedule/sources.js';
export const GDELT_GH_DATA = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/gdelt-context.json";
export const GDELT_GH_STATUS = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/gdelt-status.json";
export async function gdeltContext(env, slot) {
  const {data,status}=await readCollectorPair(env,'gdelt',GDELT_GH_DATA,GDELT_GH_STATUS,{nowMs:slot,maxAgeMs:4*HOUR});
  if (!status || status.source !== "gdelt_context" ||
      !["ok","partial","error"].includes(status.state)) {
    throw new Error("unexpected GDELT mirror status");
  }
  const checked=Date.parse(status.checked_at);
  if (!Number.isFinite(checked) || checked>slot+15*MINUTE ||
      slot-checked>4*HOUR || status.state==="error") {
    throw new Error("unexpected stale or failed GDELT mirror");
  }
  if (!data || data.source!=="gdelt_context" ||
      typeof data.latest_batch!=="string" || !/^\d{14}$/.test(data.latest_batch) ||
      !Array.isArray(data.batches) || data.batches.length>8 ||
      !Array.isArray(data.sample) || data.sample.length>32 ||
      !Number.isSafeInteger(data.coded_rows_total) || data.coded_rows_total<0 ||
      !Number.isSafeInteger(data.coded_rows_matched) || data.coded_rows_matched<0 ||
      data.coded_rows_matched>data.coded_rows_total) {
    throw new Error("unexpected GDELT mirror data");
  }
  const acquired=Date.parse(data.latest_batch.replace(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
    "$1-$2-$3T$4:$5:$6Z"));
  if (!Number.isFinite(acquired) || acquired>slot+30*MINUTE ||
      slot-acquired>6*HOUR) {
    throw new Error("unexpected GDELT source batch date");
  }
  const allowed=new Set(["IR","IS","LE","SY","IZ"]);
  const relevant=new Set(["13","15","17","18","19","20"]);
  const examples=[];
  for (const entry of data.sample) {
    if (!entry || typeof entry.id!=="string" || !/^\d{4,20}$/.test(entry.id) ||
        !allowed.has(entry.action_country) || !relevant.has(entry.root_code) ||
        typeof entry.url!=="string") continue;
    let u;
    try { u=new URL(entry.url); } catch { continue; }
    if (!["https:","http:"].includes(u.protocol) || !u.hostname ||
        u.username || u.password || u.href.length>1400) continue;
    examples.push({
      event_id:entry.id,original_article_url:u.href,
      original_domain:u.hostname.toLowerCase(),
      action_country:entry.action_country,root_code:entry.root_code,
      reported_sources:Number.isInteger(entry.reported_sources)
        ?Math.max(0,Math.min(100000,entry.reported_sources)):null,
    });
  }
  const byActionCountry=Object.fromEntries(Object.entries(data.by_action_country||{})
    .filter(([code,n])=>allowed.has(code)&&Number.isInteger(n)&&n>=0));
  const byEventRoot=Object.fromEntries(Object.entries(data.by_event_root||{})
    .filter(([code,n])=>relevant.has(code)&&Number.isInteger(n)&&n>=0));
  const summary=item("batch/"+data.latest_batch,{
    title:"GDELT Events 2.0 — automated regional news coding",
    latest_batch:data.latest_batch,batches:data.batches.slice(0,8),
    collected_at:data.created_at,coded_rows_total:data.coded_rows_total,
    coded_rows_matched:data.coded_rows_matched,by_action_country:byActionCountry,
    by_event_root:byEventRoot,
    distinct_publisher_domains:Number.isInteger(data.distinct_publisher_domains)
      ?Math.max(0,data.distinct_publisher_domains):null,
    sample:examples.slice(0,24),attribution:"Data: GDELT Project",
    attribution_url:"https://www.gdeltproject.org/",
    source_type:"machine_coded_news_context",
    caveat:"A coded news-event is NOT confirmation that an event occurred. Article counts are not independent sources, and simultaneous claims are not verified cross-corroboration.",
  });
  return {entries:[summary],missing:status.state==="partial"?["incomplete_gdelt_exports"]:[],
    detail:status.state==="partial"?"GDELT source archives incomplete; context only":null};
}

// Active official maritime advisories, mirrored from MARAD via GitHub Actions.
