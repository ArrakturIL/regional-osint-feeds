import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./regional-osint-monitor.js", import.meta.url), "utf8");
const { default: worker } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

assert.equal(typeof worker.fetch, "function");
assert.equal(typeof worker.scheduled, "function");

const now = Date.now();
function mockEnv({ observations = [], statuses = [], providers = [], aviation = [], corridor = [], quotas = [] } = {}) {
  return {
    SUMMARY_TOKEN: "test-token",
    DB: {
      async batch(statements) {
        assert.equal(statements.length, 6, "summary must read six bounded D1 result sets");
        return [observations, statuses, providers, aviation, corridor, quotas].map(results => ({ results }));
      },
      prepare(sql) { return { sql, bind(...params) { return { sql, params }; } }; },
    },
  };
}
async function summary(env = mockEnv(), path = "/summary?hours=1") {
  const response = await worker.fetch(new Request("https://example.test" + path, {
    headers: { Authorization: "Bearer test-token" },
  }), env);
  return { response, body: await response.json() };
}

{
  const response = await worker.fetch(new Request("https://example.test/summary"), { SUMMARY_TOKEN: "test-token" });
  assert.equal(response.status, 401, "summary requires authorization");
}
{
  const response = await worker.fetch(new Request("https://example.test/not-found"), { SUMMARY_TOKEN: "test-token" });
  assert.equal(response.status, 404, "unknown paths are rejected");
}
{
  const { response, body } = await summary();
  assert.equal(response.status, 200);
  assert.equal(body.aviation_focus.length, 2);
  assert(body.aviation_focus.every(x => x.status === "no_recent_sample" && x.current_count === null));
  assert.equal(body.airbridge_context.regions.length, 6);
  assert(body.airbridge_context.regions.every(x => x.status === "no_recent_sample"));
  assert.equal(body.airbridge_context.planned_requests_per_day, 24);
  assert.equal(body.sources.find(x => x.source === "airbridge_context").interval_minutes, 60);
}
{
  const stale = now - 3 * 60 * 60 * 1000;
  const { body } = await summary(mockEnv({
    statuses: [{ source: "adsb_alt", state: "partial", attempted_at: now, succeeded_at: stale }],
    aviation: [{ source: "adsb_alt", observed_at: stale,
      payload: JSON.stringify({ area: "tehran", observed_aircraft: 0 }) }],
  }));
  const focus = body.aviation_focus.find(x => x.source === "adsb_alt");
  assert.equal(focus.status, "no_recent_sample", "stale zero cannot be shown as current");
  assert.equal(focus.current_count, null);
  assert.equal(focus.last_sample_count, 0);
}
{
  const { body } = await summary(mockEnv({
    statuses: [{ source: "adsb", state: "error", attempted_at: now, succeeded_at: now - 60000 }],
    aviation: [{ source: "adsb", observed_at: now - 60000,
      payload: JSON.stringify({ area: "tehran", observed_aircraft: 3 }) }],
  }));
  const focus = body.aviation_focus.find(x => x.source === "adsb");
  assert.equal(focus.status, "source_unavailable");
  assert.equal(focus.current_count, null, "unavailable source cannot present a historical count as live");
}
{
  const { body } = await summary(mockEnv({
    providers: [{ provider: "avioadsb.org", next_allowed_at: 0, lease_until: 0, failures: 0,
      last_status: 200, last_error: null }],
    quotas: [{ provider: "avioadsb.org", remaining: 9, reset_at: now + 3_600_000, checked_at: now }],
    corridor: [{ observed_at: now - 60000, payload: JSON.stringify({
      area: "north_america_east", observed_aircraft: 123, airlift_type_observed: 1,
      tanker_type_observed: 0, flagged_logistics_type: 1,
    }) }],
  }));
  const area = body.airbridge_context.regions.find(x => x.area === "north_america_east");
  assert.equal(area.status, "sampled");
  assert.equal(area.sample_count_24h, 1);
  assert.equal(area.last_airlift_type_observed, 1);
  assert.equal(area.flagged_logistics_snapshots_24h, 1);
  assert.equal(body.provider_health[0].quota_remaining, 9);
  assert.match(body.airbridge_context.note, /No origin\/destination/);
}
{
  const { response } = await summary(mockEnv(), "/summary?hours=25");
  assert.equal(response.status, 400, "summary rejects unbounded time windows");
}

console.log("PASS: 7 Worker auth, freshness, quota and corridor-summary regression checks");
