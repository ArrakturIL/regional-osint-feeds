import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const code=await readFile(new URL("./regional-osint-monitor.js", import.meta.url),"utf8");
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const slot=Date.parse("2026-11-11T20:55:00Z");
const latest="20261111203000";
const status={source:"gdelt_context",state:"ok",checked_at:new Date(slot-60000).toISOString()};
const goodData={
  source:"gdelt_context",latest_batch:latest,
  created_at:new Date(slot-60000).toISOString(),
  batches:[latest],coded_rows_total:235,coded_rows_matched:3,
  by_action_country:{IR:2,IS:1},
  by_event_root:{"18":2,"13":1},
  distinct_publisher_domains:2,
  sample:[{id:"123456789",url:"https://example.net/news/iran",action_country:"IR",
    root_code:"18",reported_sources:1},{id:"999999999",url:"https://example.net/other",
    action_country:"ZZ",root_code:"18",reported_sources:12}],
};
function harness() {
  const calls={batch:[],writes:[],fetch:[]};
  const db={
    prepare(sql) {return {bind(...params) {
      return {sql,params,
        async first(){if(sql.includes("worker_manual_runs"))return null;throw Error("unexpected first: "+sql);},
        async run(){calls.writes.push({sql,params});return {meta:{changes:1}};},
      };
    }};},
    async batch(statements) {calls.batch.push(statements);return statements.map(()=>({success:true}));},
  };
  return {calls,env:{DB:db}};
}
const oldFetch=globalThis.fetch;
let fixture={status,data:goodData};
let requests=[];
globalThis.fetch=async(url)=>{
  requests.push(String(url));
  if(String(url).endsWith("gdelt-status.json"))return Response.json(fixture.status);
  if(String(url).endsWith("gdelt-context.json"))return Response.json(fixture.data);
  throw Error("unexpected request "+url);
};
try {
  const h=harness();
  await worker.scheduled({scheduledTime:slot},h.env);
  assert.equal(requests.length,2);
  assert.equal(h.calls.batch.length,1);
  const [insert,sourceStatus]=h.calls.batch[0];
  assert.equal(insert.params[0],"gdelt_context");
  const records=JSON.parse(insert.params[2]);
  assert.equal(records.length,1);
  assert.equal(records[0].payload.source_type,"machine_coded_news_context");
  assert.equal(records[0].payload.sample.length,1,"invalid country is not stored");
  assert.match(records[0].payload.caveat,/NOT confirmation/);
  assert.equal(sourceStatus.params[3],"ok");

  // Failure is reported as failure, not a valid 'zero media activity' observation.
  requests=[];
  fixture={status:{...status,state:"error"},data:goodData};
  const bad=harness();
  await worker.scheduled({scheduledTime:slot},bad.env);
  assert.equal(bad.calls.batch.length,0);
  assert(bad.calls.writes.some(x=>x.params.includes("error")));

  fixture={status:{...status,checked_at:new Date(slot-5*3600000).toISOString()},data:goodData};
  const stale=harness();
  await worker.scheduled({scheduledTime:slot},stale.env);
  assert.equal(stale.calls.batch.length,0);

  fixture={status,data:{...goodData,coded_rows_total:0,coded_rows_matched:1}};
  const invalid=harness();
  await worker.scheduled({scheduledTime:slot},invalid.env);
  assert.equal(invalid.calls.batch.length,0);

} finally {globalThis.fetch=oldFetch;}
console.log("PASS GDELT mirror ingestion, provenance, invalid/unverified rows and stale/error gating");
