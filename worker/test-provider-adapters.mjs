import assert from "node:assert/strict";
import {
  openSkyRequest, parseOpenSky, adsbExchangeRequest, parseAdsbExchange, compareAreaSnapshots,
} from "./aviation-providers.mjs";

const region={name:"tehran",lat:35.7,lon:51.4,radiusNm:100};
const now=Date.parse("2026-11-11T18:00:00Z"),seconds=now/1000;
function state(icao, overrides={}) {
  const a=Array(18).fill(null);
  a[0]=icao;a[1]=null;a[3]=seconds-2;a[4]=seconds-1;
  a[5]=51.45;a[6]=35.75;a[8]=false;a[17]=4;
  for(const [k,v] of Object.entries(overrides)) a[Number(k)]=v;
  return a;
}
{
  const r=openSkyRequest(region);
  const u=new URL(r.url);
  assert.equal(u.hostname,"opensky-network.org");
  assert.equal(u.pathname,"/api/states/all");
  assert(r.bounding_box_sq_degrees>0 && r.bounding_box_sq_degrees<=25);
  assert.equal(r.estimated_state_credits,1);
  assert(!("Authorization" in r.headers));
  assert.equal(openSkyRequest(region,"test-token").headers.Authorization,"Bearer test-token");
}
{
  const data={time:seconds,states:[state("aabbcc"),state("AABBCC"),state("112233",{"1":"TEST123"}),state("334455",{"8":true}),state("445566",{"3":seconds-90}),state("556677",{"5":null})]};
  const result=parseOpenSky(data,region,now);
  assert.equal(result.observed_aircraft,2,"unique fresh airborne positions only");
  assert.equal(result.missing_callsign,1);
  assert.equal(result.emitter_categories["4"],2);
  assert.equal(result.on_ground_excluded,1);
  assert.equal(result.stale_positions_excluded,1);
  assert.equal(result.missing_positions_excluded,1);
  assert.equal(result.sample_status,"aircraft_observed");
  assert(!("icao24" in result));
}
{
  const zero=parseOpenSky({time:seconds,states:[]},region,now);
  assert.equal(zero.sample_status,"zero_in_sample");
  assert.equal(zero.receiver_coverage_unverified,true);
  assert.throws(()=>parseOpenSky({time:seconds,states:null},region,now),/invalid/);
  assert.throws(()=>parseOpenSky({time:seconds-300,states:[]},region,now),/stale/);
}
{
  assert.throws(()=>adsbExchangeRequest(region,""),/entitlement/);
  const request=adsbExchangeRequest(region,"example-key");
  assert.equal(request.headers["X-Api-Key"],"example-key");
  assert.equal(request.headers["Accept-Encoding"],"gzip");
  assert(request.url.endsWith("/lat/35.7/lon/51.4/dist/100"));
}
{
  const data={now,ac:[
    {hex:"aabbcc",lat:35.7,lon:51.4,seen_pos:1,flight:null,t:"C17",dbFlags:1},
    {hex:"AABBCC",lat:35.7,lon:51.4,seen_pos:1,flight:"DUP",t:"C17"},
    {hex:"112233",lat:35.71,lon:51.4,seen_pos:2,flight:"TEST",t:"K46A",dbFlags:0},
    {hex:"334455",lat:35.71,lon:51.4,seen_pos:99,t:"C17"},
    {hex:"445566",lat:10,lon:10,seen_pos:1,t:"C17"},
    {hex:"556677",lat:null,lon:51.4,seen_pos:1,t:"C17"},
  ]};
  const result=parseAdsbExchange(data,region,now);
  assert.equal(result.observed_aircraft,2);
  assert.equal(result.military_db_flagged,1);
  assert.equal(result.airlift_type_observed,1);
  assert.equal(result.tanker_type_observed,1);
  assert.equal(result.missing_callsign,1);
  assert.equal(result.sample_status,"aircraft_observed");
  assert(!JSON.stringify(result).includes("aabbcc"),"no aircraft identifiers in stored snapshot");
  assert(!JSON.stringify(result).includes("example-key"),"no credentials in stored snapshot");
}
{
  assert.equal(parseAdsbExchange({now,ac:[]},region,now).sample_status,"zero_in_sample");
  assert.throws(()=>parseAdsbExchange({now,ac:null},region,now),/invalid/);
  assert.throws(()=>parseAdsbExchange({now:now-360000,ac:[]},region,now),/stale/);
}
{
  const a={provider:"opensky",area:"tehran",snapshot_at:now,observed_aircraft:0};
  const b={provider:"adsbexchange",area:"tehran",snapshot_at:now+60000,observed_aircraft:3};
  assert.equal(compareAreaSnapshots(a,b).state,"source_disagreement");
  assert.equal(compareAreaSnapshots(a,{...b,observed_aircraft:0}).state,"both_report_zero");
  assert.equal(compareAreaSnapshots(a,{...b,provider:"opensky"}).state,"not_comparable");
  assert.equal(compareAreaSnapshots(a,{...b,snapshot_at:now+3600000}).state,"not_comparable");
  assert.equal(compareAreaSnapshots(a,b).confirmed_empty_airspace,false);
}

console.log("PASS: OpenSky and ADS-B Exchange parser, entitlement, freshness and cross-source regression checks");
