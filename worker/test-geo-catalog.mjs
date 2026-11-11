import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./regional-osint-monitor.js",import.meta.url),"utf8");
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const HOUR=3600000;
function makeDB({cooldown=false}={}) {
  const calls={batches:[],writes:[],first:[]};
  const db={
    prepare(sql) {
      return {bind(...params) {
        return {
          sql,params,
          async first() {
            calls.first.push({sql,params});
            if (sql.includes("worker_manual_runs")) return null;
            if (sql.includes("UPDATE worker_provider_state SET lease_until")) return cooldown?null:{failures:0};
            if (sql.includes("SELECT next_allowed_at,lease_until,last_error FROM worker_provider_state"))
              return {next_allowed_at:Date.now()+3600000,lease_until:0,last_error:"upstream HTTP 429"};
            throw Error("unexpected first(): "+sql);
          },
          async run() {calls.writes.push({sql,params});return {meta:{changes:1}};},
        };
      }};
    },
    async batch(statements) {calls.batches.push(statements);return statements.map(()=>({success:true}));},
  };
  return {db,calls};
}
function bySlot(minutes,slotMod,reference=Date.now()) {
  const size=minutes*60000;
  return Math.floor(reference/size)*size+slotMod*60000;
}
function requestEntries(calls) {
  return calls.batches.flatMap(statements=>statements.filter(x=>x.params?.[2]).flatMap(stmt=>{
    try { const a=JSON.parse(stmt.params[2]);return Array.isArray(a)?a.map(r=>({...r,payload:JSON.parse(r.payload)})):[]; } catch{return [];}
  }));
}
let fetchFn=()=>{throw Error("mock fetch not assigned")};
let requested=[];
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,opt)=>{
  assert.equal(opt.redirect,"manual","Cloudflare Workers do not support redirect:error");
  requested.push({url:String(url),headers:opt.headers});
  return fetchFn(String(url),opt);
};
function stacResponse(url,slot,{malformed=false,old=false}={}) {
  const parsed=new URL(url),collection=parsed.searchParams.get("collections");
  const bbox=parsed.searchParams.get("bbox").split(",").map(Number);
  if (malformed) return Response.json({type:"FeatureCollection",features:[{id:"BROKEN"}]});
  const id=collection==="sentinel-1-grd"
    ?"S1D_IW_GRDH_1SDV_20261111T142710_005421_00A586" : "S2C_39SWU_20261109_0_L2A";
  const item={type:"Feature",collection,id,bbox,links:[{rel:"self",href:"https://earth-search.aws.element84.com/v1/collections/"+collection+"/items/"+id}],
    properties:{datetime:new Date(slot-(old?30*24:1)*HOUR).toISOString(),platform:"sentinel-2c","eo:cloud_cover":3.5,"sar:polarizations":["VV","VH"]},
    assets:{thumbnail:{href:"https://sentinel-cogs.s3.us-west-2.amazonaws.com/example/preview.jpg"}}};
  return Response.json({type:"FeatureCollection",features:[item]});
}
function oamResponse(url,hasRows=true) {
  const bbox=new URL(url).searchParams.get("bbox").split(",").map(Number);
  return Response.json({meta:{provided_by:"OpenAerialMap",license:"CC-BY 4.0"},
    results:hasRows?[{_id:"59e62b863d6412ef72209ae1",bbox,gsd:0.35,provider:"Example contributor",
      acquisition_start:"2024-12-09T21:00:00.000Z",title:"Archival image",
      meta_uri:"https://api.openaerialmap.org/meta/59e62b863d6412ef72209ae1"}]:[]});
}
try {
  // A successful Sentinel lookup emits metadata, not aircraft activity or a processed image.
  {
    const slot=bySlot(180,44),h=makeDB();requested=[];
    fetchFn=url=>stacResponse(url,slot);
    await worker.scheduled({scheduledTime:slot}, {DB:h.db});
    assert.equal(requested.length,1);
    const u=new URL(requested[0].url);
    assert.equal(u.hostname,"earth-search.aws.element84.com");
    assert.equal(u.searchParams.get("sortby"),"-properties.datetime");
    assert.equal(u.searchParams.get("limit"),"8");
    const records=requestEntries(h.calls);
    assert.equal(records.length,1);
    const item=records[0].payload;
    assert.equal(item.metadata_only,true);
    assert.equal(item.source_type,"open_satellite_scene_catalog");
    assert.equal(item.cloud_cover_percent,3.5);
    assert(item.item_url.startsWith("https://earth-search.aws.element84.com/v1/collections/"));
    assert(!("aircraft" in item));
    assert.equal(h.calls.batches[0][1].params[3],"ok");
    assert.equal(h.calls.batches[0][0].params[0],"sentinel_catalog");
  }

  // Archived OAM scenes keep their historical capture dates.
  {
    const slot=bySlot(1440,49),h=makeDB();requested=[];
    fetchFn=url=>oamResponse(url,true);
    await worker.scheduled({scheduledTime:slot}, {DB:h.db});
    assert.equal(requested.length,1);
    assert(new URL(requested[0].url).hostname==="api.openaerialmap.org");
    const records=requestEntries(h.calls);
    assert.equal(records.length,1);
    const item=records[0].payload;
    assert.equal(item.archive_only,true);
    assert.equal(item.metadata_only,true);
    assert.equal(item.acquired_at,"2024-12-09T21:00:00.000Z");
    assert.equal(item.ground_sample_distance_m,0.35);
    assert.equal(h.calls.batches[0][0].params[0],"aerial_archive");
  }

  // A genuinely empty archive page is not a network error.
  {
    const slot=bySlot(1440,49),h=makeDB();requested=[];
    fetchFn=url=>oamResponse(url,false);
    await worker.scheduled({scheduledTime:slot},{DB:h.db});
    assert.equal(requestEntries(h.calls).length,0);
    assert.equal(h.calls.batches[0][1].params[3],"empty");
  }

  // Malformed nonempty data must never become a valid zero-scene observation.
  {
    const slot=bySlot(180,44),h=makeDB();requested=[];
    fetchFn=url=>stacResponse(url,slot,{malformed:true});
    await worker.scheduled({scheduledTime:slot},{DB:h.db});
    assert.equal(requestEntries(h.calls).length,0);
    assert(h.calls.writes.some(x=>x.params?.includes("error")));
  }

  // Provider 429 is recorded and backed off, not silently treated as no imagery.
  {
    const slot=bySlot(180,44),h=makeDB();requested=[];
    fetchFn=()=>new Response("rate limited",{status:429,headers:{"Retry-After":"7200"}});
    await worker.scheduled({scheduledTime:slot},{DB:h.db});
    assert.equal(requested.length,1);
    assert.equal(h.calls.batches.length,0);
    assert(h.calls.writes.some(x=>x.sql.includes("UPDATE worker_provider_state SET next_allowed_at")&&x.params[2]===429));
    assert(h.calls.writes.some(x=>x.params?.includes("error")));
  }

  // Cooldown doesn't issue an HTTP request; no false success is recorded.
  {
    const slot=bySlot(180,44),h=makeDB({cooldown:true});requested=[];
    fetchFn=()=>{throw Error("unexpected fetch while provider is in cooldown")};
    await worker.scheduled({scheduledTime:slot},{DB:h.db});
    assert.equal(requested.length,0);
    assert.equal(h.calls.batches.length,0);
    assert(h.calls.writes.some(x=>x.params?.includes("error")));
  }
} finally {globalThis.fetch=nativeFetch;}
console.log("PASS: geospatial catalog metadata, archive age, empty responses, 429 and cooldown checks");
