// Opt-in provider fetchers. This module is NOT imported by the deployed Worker and has no cron.
// Each call performs at most one request. Caller must enforce D1 leases, quotas, and entitlement.
import { openSkyRequest, adsbExchangeRequest, parseOpenSky, parseAdsbExchange } from "./aviation-providers.mjs";

export class AviationProviderError extends Error {
  constructor(provider, status, retryAfterSeconds = null) {
    super(provider + " HTTP " + status);
    this.name = "AviationProviderError";
    this.provider = provider;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
function retrySeconds(response) {
  const h=response.headers.get("Retry-After") ?? response.headers.get("X-Rate-Limit-Retry-After-Seconds");
  if (!h) return null;
  if (/^\d+$/.test(h.trim())) return Math.min(86400,Number(h.trim()));
  const seconds=Math.ceil((Date.parse(h)-Date.now())/1000);
  return Number.isFinite(seconds)&&seconds>0?Math.min(86400,seconds):null;
}
async function oneJsonFetch(provider, request, fetchImpl) {
  const response=await fetchImpl(request.url,{
    method:"GET",headers:request.headers,redirect:"error",signal:AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const error=new AviationProviderError(provider,response.status,retrySeconds(response));
    await response.body?.cancel().catch(()=>{});
    throw error;
  }
  const size=Number(response.headers.get("content-length"));
  if (Number.isFinite(size)&&size>2_000_000) {
    await response.body?.cancel().catch(()=>{});
    throw new Error(provider+" response too large");
  }
  const data=await response.json();
  if (!data || typeof data!=="object") throw new Error(provider+" malformed JSON");
  return data;
}
export async function fetchOpenSkySnapshot(region,{fetchImpl=fetch,nowMs=Date.now(),accessToken=null}={}) {
  const req=openSkyRequest(region,accessToken);
  const data=await oneJsonFetch("opensky",req,fetchImpl);
  return parseOpenSky(data,region,nowMs);
}
export async function fetchAdsbExchangeSnapshot(region,{apiKey,fetchImpl=fetch,nowMs=Date.now()}={}) {
  // A valid key and explicit provider entitlement must be configured by the operator.
  const req=adsbExchangeRequest(region,apiKey);
  const data=await oneJsonFetch("adsbexchange",req,fetchImpl);
  return parseAdsbExchange(data,region,nowMs);
}
