import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source=await readFile(new URL("./regional-osint-monitor.js",import.meta.url),"utf8");
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));

function createHarness(providerHealth) {
  const calls={queries:[],providerRequests:[],writes:[],batches:[]};
  const env={
    DB:{
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async first() {
                calls.queries.push({sql,params});
                if (sql.includes("worker_manual_runs")) return null;
                if (sql.includes("SELECT failures")) return providerHealth;
                if (sql.includes("SET lease_until=?")) return {
                  ...providerHealth,lease_until:Date.now()+30000,
                };
                throw Error("unexpected D1 first(): "+sql);
              },
              async run() {
                calls.writes.push({sql,params});
                return {meta:{changes:1}};
              },
            };
          },
        };
      },
      async batch(statements) {
        calls.batches.push(statements);
        return statements.map(()=>({success:true,meta:{changes:1}}));
      },
    },
  };
  return {env,calls};
}
const originalFetch=globalThis.fetch;
let activeCalls=null;
globalThis.fetch=async(url)=>{
  assert(activeCalls,"no network fetch without a harness");
  activeCalls.providerRequests.push(String(url));
  return Response.json({now:Math.floor(Date.now()/1000),ac:[]});
};
try {
  // A pending 429 cooldown suppresses all automatic traffic to that provider.
  {
    const health={failures:8,next_allowed_at:Date.now()+3600000,lease_until:0};
    const h=createHarness(health);
    activeCalls=h.calls;
    await worker.scheduled({scheduledTime:Date.parse("2026-11-11T19:15:00Z")},h.env);
    await worker.scheduled({scheduledTime:Date.parse("2026-11-11T19:04:00Z")},h.env);
    assert.equal(h.calls.providerRequests.length,0);
    assert.equal(h.calls.batches.length,0,"no source status updates for suppressed automatic attempts");
    assert.equal(h.calls.writes.length,0,"no unnecessary D1 writes during cooldown");
  }

  // After cooldown, the first single-region query must prioritize Tehran,
  // even when the time slot would normally select a non-focus region.
  {
    const health={failures:8,next_allowed_at:0,lease_until:0};
    const h=createHarness(health);
    activeCalls=h.calls;
    await worker.scheduled({scheduledTime:Date.parse("2026-11-11T19:15:00Z")},h.env);
    assert.equal(h.calls.providerRequests.length,1);
    assert.equal(new URL(h.calls.providerRequests[0]).pathname,"/v2/point/35.7/51.4/100");
    assert.equal(h.calls.batches.length,1,"successful recovery sample still gets recorded");
  }

  // During partial recovery, broad military endpoint is held back so it
  // cannot consume the only successful retry before priority areas.
  {
    const health={failures:3,next_allowed_at:0,lease_until:0};
    const h=createHarness(health);
    activeCalls=h.calls;
    await worker.scheduled({scheduledTime:Date.parse("2026-11-11T19:04:00Z")},h.env);
    assert.equal(h.calls.providerRequests.length,0);
    assert.equal(h.calls.batches.length,0);
  }

  // Healthy provider retains the original alternating focus/context schedule.
  {
    const health={failures:0,next_allowed_at:0,lease_until:0};
    const h=createHarness(health);
    activeCalls=h.calls;
    await worker.scheduled({scheduledTime:Date.parse("2026-11-11T19:15:00Z")},h.env);
    assert.equal(h.calls.providerRequests.length,1);
    assert.notEqual(new URL(h.calls.providerRequests[0]).pathname,"/v2/point/35.7/51.4/100");
    assert.equal(h.calls.batches.length,1);
  }

  // Healthy provider retains the military feed on its own existing hour slot.
  {
    const health={failures:0,next_allowed_at:0,lease_until:0};
    const h=createHarness(health);
    activeCalls=h.calls;
    await worker.scheduled({scheduledTime:Date.parse("2026-11-11T19:04:00Z")},h.env);
    assert.equal(h.calls.providerRequests.length,1);
    assert.equal(new URL(h.calls.providerRequests[0]).pathname,"/v2/mil");
    assert.equal(h.calls.batches.length,1);
  }
} finally {
  globalThis.fetch=originalFetch;
}
console.log("PASS: ADS-B cooldown suppression, Tehran-first recovery, and healthy schedule regression checks");
