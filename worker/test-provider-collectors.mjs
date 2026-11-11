import assert from "node:assert/strict";
import { fetchOpenSkySnapshot,fetchAdsbExchangeSnapshot,AviationProviderError } from "./aviation-provider-collectors.mjs";
const region={name:"tehran",lat:35.7,lon:51.4,radiusNm:100};
const now=Date.parse("2026-11-11T18:00:00Z");
let calls=0;
{
  const sample=await fetchOpenSkySnapshot(region,{
    nowMs:now,fetchImpl:async(url,options)=>{
      calls++;
      assert.equal(new URL(url).hostname,"opensky-network.org");
      assert.equal(options.redirect,"error");
      assert.equal(options.method,"GET");
      return Response.json({time:now/1000,states:[]});
    },
  });
  assert.equal(sample.observed_aircraft,0);
  assert.equal(sample.sample_status,"zero_in_sample");
  assert.equal(calls,1);
}
{
  let sent=false;
  await assert.rejects(fetchAdsbExchangeSnapshot(region,{fetchImpl:async()=>{sent=true;throw Error("unexpected fetch");}}),/entitlement/);
  assert.equal(sent,false,"missing API key must not cause an HTTP request");
}
{
  const sample=await fetchAdsbExchangeSnapshot(region,{
    apiKey:"example-key",nowMs:now,fetchImpl:async(url,options)=>{
      calls++;
      assert.equal(new URL(url).hostname,"gateway.adsbexchange.com");
      assert.equal(options.headers["X-Api-Key"],"example-key");
      assert.equal(options.headers["Accept-Encoding"],"gzip");
      return Response.json({now,ac:[]});
    },
  });
  assert.equal(sample.observed_aircraft,0);
  assert.equal(calls,2);
}
{
  await assert.rejects(fetchOpenSkySnapshot(region,{
    nowMs:now,fetchImpl:async()=>new Response("",{status:403}),
  }),error=>error instanceof AviationProviderError&&error.status===403&&error.provider==="opensky");
}
{
  await assert.rejects(fetchAdsbExchangeSnapshot(region,{
    apiKey:"example-key",nowMs:now,
    fetchImpl:async()=>new Response("",{status:429,headers:{"Retry-After":"900"}}),
  }),error=>error instanceof AviationProviderError&&error.status===429&&error.retryAfterSeconds===900);
}
{
  await assert.rejects(fetchOpenSkySnapshot(region,{
    nowMs:now,fetchImpl:async()=>Response.json({time:now/1000,states:null}),
  }),/invalid OpenSky/);
}
console.log("PASS: optional aviation collectors perform at most one call, require entitlement and preserve error states");
