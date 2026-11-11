// Provider adapters are deliberately NOT wired to the production cron.
// OpenSky access from Cloudflare has not been established; ADS-B Exchange requires a valid API entitlement.
// All parsers return aggregated snapshots only. They never persist ICAO IDs, callsigns, positions or flight tracks.
const AIRLIFT_TYPES = new Set(["C17", "C5M", "C5", "C130", "C30J", "C27J", "A400", "C160", "C295", "IL76", "AN12"]);
const TANKER_TYPES = new Set(["K35R", "K35E", "K46A", "KC10", "KDC10", "KC30", "K767"]);

function finiteNumber(value) { return typeof value === "number" && Number.isFinite(value); }
function validCoords(lat, lon) { return finiteNumber(lat) && finiteNumber(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180; }
function timestampMs(value) {
  if (!finiteNumber(value)) throw new Error("invalid provider timestamp");
  return value < 1e12 ? value * 1000 : value;
}
function ensureFresh(value, nowMs, maxAgeMs = 120000) {
  const at = timestampMs(value);
  if (!finiteNumber(nowMs) || Math.abs(nowMs - at) > maxAgeMs) throw new Error("stale provider snapshot");
  return at;
}
function distanceNm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
  return 3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
function checkRegion(region) {
  if (!region || typeof region.name !== "string" || !/^[a-z][a-z0-9_]{1,50}$/.test(region.name)
    || !validCoords(region.lat, region.lon) || !finiteNumber(region.radiusNm)
    || region.radiusNm <= 0 || region.radiusNm > 150) throw new Error("invalid observation region");
}
function baseSnapshot(provider, region, at, observed, extra) {
  return {
    provider, area: region.name, snapshot_at: at, radius_nm: region.radiusNm,
    observed_aircraft: observed, sample_status: observed ? "aircraft_observed" : "zero_in_sample",
    receiver_coverage_unverified: true, evidence_grade: "single_receiver_network_snapshot",
    caveat: "Zero means no aircraft in this provider's valid snapshot, not empty airspace. Types and database flags are not proof of military affiliation or route.",
    ...extra,
  };
}

// Official OpenSky REST API: /states/all?lamin=...&lomin=...&lamax=...&lomax=...
// Bounding box is a rectangular approximation of the requested radius; the parser filters by distance.
export function openSkyRequest(region, accessToken = null) {
  checkRegion(region);
  const dLat = region.radiusNm / 60;
  const cos = Math.cos(region.lat * Math.PI / 180);
  if (cos < 0.15) throw new Error("region too close to pole");
  const dLon = region.radiusNm / (60 * cos);
  const lamin = Math.max(-90, region.lat - dLat), lamax = Math.min(90, region.lat + dLat);
  const lomin = region.lon - dLon, lomax = region.lon + dLon;
  if (lomin < -180 || lomax > 180) throw new Error("region crosses antimeridian");
  const params = new URLSearchParams({lamin:String(lamin),lomin:String(lomin),lamax:String(lamax),lomax:String(lomax)});
  const headers = { Accept: "application/json" };
  if (accessToken !== null) {
    if (typeof accessToken !== "string" || !accessToken.trim()) throw new Error("invalid OpenSky access token");
    headers.Authorization = "Bearer " + accessToken;
  }
  return { url: "https://opensky-network.org/api/states/all?" + params, headers,
    bounding_box_sq_degrees: (lamax-lamin)*(lomax-lomin),
    estimated_state_credits: (lamax-lamin)*(lomax-lomin) <= 25 ? 1 : (lamax-lamin)*(lomax-lomin) <= 100 ? 2 : 3 };
}

export function parseOpenSky(data, region, nowMs = Date.now()) {
  checkRegion(region);
  if (!data || !Array.isArray(data.states)) throw new Error("invalid OpenSky states response");
  const at = ensureFresh(data.time, nowMs);
  const seen = new Set(), categories = {};
  let noCallsign = 0, onGroundExcluded = 0, stalePositionsExcluded = 0, missingPositionExcluded = 0;
  for (const state of data.states) {
    if (!Array.isArray(state) || typeof state[0] !== "string" || !/^[a-f\d]{6}$/i.test(state[0])) continue;
    const [icao, callsign, , timePosition, lastContact, lon, lat, , onGround, , , , , , , , , category] = state;
    if (!validCoords(lat,lon)) { missingPositionExcluded++; continue; }
    if (!finiteNumber(timePosition) || at - timePosition*1000 > 30000 || at - timePosition*1000 < -5000
      || !finiteNumber(lastContact) || at - lastContact*1000 > 30000) { stalePositionsExcluded++; continue; }
    if (distanceNm(region.lat,region.lon,lat,lon) > region.radiusNm) continue;
    if (onGround === true) { onGroundExcluded++; continue; }
    if (seen.has(icao.toLowerCase())) continue;
    seen.add(icao.toLowerCase());
    if (!String(callsign || "").trim()) noCallsign++;
    const key = Number.isInteger(category) && category >= 0 && category <= 20 ? String(category) : "unknown";
    categories[key] = (categories[key] || 0) + 1;
  }
  return baseSnapshot("opensky",region,at,seen.size,{
    missing_callsign:noCallsign,emitter_categories:categories,
    on_ground_excluded:onGroundExcluded,stale_positions_excluded:stalePositionsExcluded,
    missing_positions_excluded:missingPositionExcluded,
    attribution:"The OpenSky Network — cite Schäfer et al., Bringing Up OpenSky (IPSN 2014)",
    attribution_url:"https://opensky-network.org",
    note:"OpenSky emitter category is not an aircraft type, military database flag or route.",
  });
}

// ADS-B Exchange v2 requires a licensed X-Api-Key; the published RPM limit is not a free entitlement.
// Never log or persist request.headers["X-Api-Key"].
export function adsbExchangeRequest(region, apiKey) {
  checkRegion(region);
  if (typeof apiKey !== "string" || apiKey.trim().length < 8) throw new Error("ADS-B Exchange API entitlement required");
  return {
    url: "https://gateway.adsbexchange.com/api/aircraft/v2/lat/" +
      region.lat + "/lon/" + region.lon + "/dist/" + region.radiusNm,
    headers: { "X-Api-Key": apiKey, "Accept-Encoding": "gzip", Accept:"application/json" },
  };
}
export function parseAdsbExchange(data, region, nowMs = Date.now()) {
  checkRegion(region);
  if (!data || !Array.isArray(data.ac)) throw new Error("invalid ADS-B Exchange aircraft response");
  const at = ensureFresh(data.now, nowMs);
  const seen = new Set(), types = {};
  let noCallsign=0, flaggedMilitary=0, airlift=0, tankers=0, stalePositionsExcluded=0;
  for (const plane of data.ac) {
    if (!plane || typeof plane.hex !== "string" || !/^[a-f\d]{6}$/i.test(plane.hex)) continue;
    if (!validCoords(plane.lat,plane.lon) || !finiteNumber(plane.seen_pos) || plane.seen_pos < 0 || plane.seen_pos > 30) {
      stalePositionsExcluded++; continue;
    }
    if (distanceNm(region.lat,region.lon,plane.lat,plane.lon)>region.radiusNm) continue;
    const hex=plane.hex.toLowerCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    if (!String(plane.flight||"").trim()) noCallsign++;
    const type=typeof plane.t==="string" && /^[A-Z0-9]{2,5}$/.test(plane.t.toUpperCase())?plane.t.toUpperCase():"unknown";
    types[type]=(types[type]||0)+1;
    if ((Number(plane.dbFlags)&1)===1) flaggedMilitary++;
    if (AIRLIFT_TYPES.has(type)) airlift++;
    if (TANKER_TYPES.has(type)) tankers++;
  }
  return baseSnapshot("adsbexchange",region,at,seen.size,{
    types,missing_callsign:noCallsign,military_db_flagged:flaggedMilitary,
    airlift_type_observed:airlift,tanker_type_observed:tankers,
    stale_positions_excluded:stalePositionsExcluded,
    attribution:"ADS-B Exchange",attribution_url:"https://www.adsbexchange.com",
    note:"Only aircraft with a recent reported position inside the requested radius are counted. Database flags and aircraft type are unverified indicators.",
  });
}

// Compare ONLY overlapping samples. Two zeroes are still not proof of empty airspace.
export function compareAreaSnapshots(a,b,maxGapMs=10*60*1000) {
  if (!a || !b || a.area!==b.area || !finiteNumber(a.snapshot_at) || !finiteNumber(b.snapshot_at)
    || Math.abs(a.snapshot_at-b.snapshot_at)>maxGapMs
    || !Number.isInteger(a.observed_aircraft) || !Number.isInteger(b.observed_aircraft)
    || a.observed_aircraft<0 || b.observed_aircraft<0 || a.provider===b.provider)
    return {state:"not_comparable",confirmed_empty_airspace:false};
  if ((a.observed_aircraft===0)!==(b.observed_aircraft===0))
    return {state:"source_disagreement",confirmed_empty_airspace:false};
  return {state:a.observed_aircraft===0?"both_report_zero":"both_report_aircraft",confirmed_empty_airspace:false};
}
