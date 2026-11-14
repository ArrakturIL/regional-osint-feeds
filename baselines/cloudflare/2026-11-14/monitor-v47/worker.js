const EASA = "https://www.easa.europa.eu/en/taxonomy/term/2518/all/feed.xml";
const MSCIO = "https://mscio.eu/folder/documents/UKMTO%20Advisories/";
const IODA = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events";
const AIS = "wss://stream.aisstream.io/v0/stream";
const HOUR = 3_600_000;
const MINUTE = 60_000;
const DEFAULT_REGION = {
  air_focus: ["tehran", 35.7, 51.4, 100],
  air: [
    ["northern_iran", 35.7, 51.4, 220],
    ["western_iran", 33.1, 48.4, 190],
    ["eastern_iran", 33.6, 58.4, 260],
    ["persian_gulf", 26.6, 51.8, 195],
    ["hormuz", 26.5, 56.4, 85],
    ["gulf_of_oman", 24.5, 59.0, 150],
  ],
  marine: [55.4, 25.4, 58.1, 27.5],
  country: "IR",
  firms: [44, 24, 64, 40],
};

// D1 coordinates both collectors and overlapping scheduled/manual invocations.
// A lease prevents concurrent requests; cooldown survives isolate restarts.
async function providerGet(env, provider, url) {
  const db = env.DB;
  await db.prepare("INSERT OR IGNORE INTO worker_provider_state(provider) VALUES (?)").bind(provider).run();
  let claim;
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    claim = await db.prepare(`UPDATE worker_provider_state SET lease_until=?
      WHERE provider=? AND next_allowed_at<=? AND lease_until<=? RETURNING *`)
      .bind(now + 30000, provider, now, now).first();
    if (claim) break;
    const state = await db.prepare("SELECT * FROM worker_provider_state WHERE provider=?").bind(provider).first();
    const until = Math.max(state.next_allowed_at, state.lease_until);
    if (state.lease_until <= now && until - now <= 2000 && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, Math.max(1, until - now + 20)));
      continue;
    }
    throw new Error("upstream " + provider + " paused until " + new Date(until).toISOString()
      + (state.last_error ? "; " + state.last_error : state.lease_until > now ? "; request in progress" : "; recovery pacing"));
  }
  if (!claim) throw new Error("upstream " + provider + " request busy");
  let response;
  let data;
  let failure;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (provider === "avioadsb.org") {
      const rh=response.headers.get("X-RateLimit-Remaining"), sh=response.headers.get("X-RateLimit-Reset");
      const remaining=Number(rh), resetSeconds=Number(sh);
      if (rh!==null && sh!==null && Number.isInteger(remaining) && remaining>=0 &&
          Number.isFinite(resetSeconds) && resetSeconds>=0 && resetSeconds<=172800) {
        await db.prepare(`INSERT INTO worker_provider_quota(provider,remaining,reset_at,checked_at)
          VALUES(?,?,?,?) ON CONFLICT(provider) DO UPDATE SET
          remaining=excluded.remaining,reset_at=excluded.reset_at,checked_at=excluded.checked_at`)
          .bind(provider,remaining,Date.now()+resetSeconds*1000,Date.now()).run().catch(()=>{});
      }
    }
    if (!response.ok) throw new Error("upstream HTTP " + response.status);
    data = await response.json();
    if (!Array.isArray(data.ac) || !Number.isFinite(data.now)) throw new Error("unexpected ADS-B response");
    const timestamp = data.now < 1e12 ? data.now * 1000 : data.now;
    if (Math.abs(Date.now() - timestamp) > 5 * MINUTE) throw new Error("unexpected stale ADS-B response");
  } catch (error) {
    failure = /^(upstream |unexpected )/.test(error.message) ? error.message : "upstream unavailable";
  }
  const now = Date.now();
  if (failure) {
    const failures = Math.min(12, claim.failures + 1);
    const status = response?.status || 0;
    const base = status === 429 ? 10 * MINUTE : status === 401 || status === 403 ? 6 * HOUR : MINUTE;
    const delay = Math.min(6 * HOUR, base * 2 ** Math.min(8, failures - 1));
    const header = response?.headers.get("Retry-After")?.trim();
    let retryAt = 0;
    if (header && /^\d+$/.test(header)) retryAt = now + Number(header) * 1000;
    else if (header) retryAt = Date.parse(header);
    const until = Math.max(now + delay, Number.isFinite(retryAt) ? retryAt : 0);
    await response?.body?.cancel().catch(() => {});
    await db.prepare(`UPDATE worker_provider_state SET next_allowed_at=?,lease_until=0,
      failures=?,last_status=?,last_error=? WHERE provider=? AND lease_until=?`)
      .bind(until, failures, status, failure, provider, claim.lease_until).run();
    throw new Error(failure + "; " + provider + " retry after " + new Date(until).toISOString());
  }
  const remainingFailures = Math.max(0, claim.failures - 1);
  // Recover gradually: a successful probe does not immediately restore burst traffic.
  const gap = remainingFailures ? Math.min(10 * MINUTE, MINUTE * 2 ** (remainingFailures - 1)) : 1500;
  await db.prepare(`UPDATE worker_provider_state SET next_allowed_at=?,lease_until=0,
    failures=?,last_status=200,last_error=NULL WHERE provider=? AND lease_until=?`)
    .bind(now + gap, remainingFailures, provider, claim.lease_until).run();
  return data;
}

async function get(url, format) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new Error("upstream unavailable");
  }
  if (!response.ok) throw new Error("upstream HTTP " + response.status);
  return format === "json" ? response.json() : response.text();
}

function item(id, payload) {
  return { id: String(id), payload };
}

function settings(env) {
  return env.REGION ? { ...DEFAULT_REGION, ...JSON.parse(env.REGION) } : DEFAULT_REGION;
}

function textOnly(value) {
  return value?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
}

function href(value, base) {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" && url.origin === new URL(base).origin ? url.href : null;
  } catch {
    return null;
  }
}

function airSamplingRegions(env) {
  const config = settings(env);
  const focus = config.air_focus, regions = config.air;
  if (!Array.isArray(focus) || focus.length !== 4 || typeof focus[0] !== "string"
    || ![focus[1],focus[2],focus[3]].every(Number.isFinite)
    || Math.abs(focus[1]) > 90 || Math.abs(focus[2]) > 180 || focus[3] <= 0
    || !Array.isArray(regions) || !regions.length || regions.length > 6) {
    throw new Error("invalid aviation focus or context regions");
  }
  const others = regions.filter(r => Array.isArray(r)
    && (Math.abs(r[1] - focus[1]) > 0.25 || Math.abs(r[2] - focus[2]) > 0.25));
  return { focus, context: others.length ? others : regions };
}

const AIRLIFT_TYPES = new Set(["C17","C5M","C5","C130","C30J","C27J","A400","C160","C295","IL76","AN12"]);
const TANKER_TYPES = new Set(["K35R","K35E","K46A","KC10","KDC10","KC30","K767"]);
const AIRBRIDGE_REGIONS = [
  ["north_america_east",40.7,-73.9],
  ["north_atlantic_west",47.5,-52.5],
  ["western_europe",51.5,-0.1],
  ["central_europe",50.1,8.7],
  ["eastern_mediterranean",35.2,33.2],
  ["arabian_gulf",25.2,55.3],
];

async function aviation(env, slot) {
  const { focus, context } = airSamplingRegions(env);
  // Existing 15-minute budget: 48 focus and 48 context samples per day.
  // After a provider rate-limit failure, spend recovery probes on the focus area.
  const health = await env.DB.prepare("SELECT failures FROM worker_provider_state WHERE provider=?")
    .bind("adsb.lol").first();
  const recovering = (health?.failures || 0) > 0;
  const turn = Math.floor(slot / (15 * MINUTE)), primary = recovering || turn % 2 === 0;
  const region = primary ? focus : context[Math.floor(turn / 2) % context.length];
  const sample = await aviationRegion(region, slot, env);
  sample.payload.sampled_only = true;
  sample.payload.receiver_coverage_unverified = true;
  sample.payload.sampling_priority = primary ? "primary" : "context";
  sample.payload.expected_same_region_interval_minutes = primary ? 30 : 30 * context.length;
  sample.payload.coverage_note = "Zero detected in one receiver-network snapshot does not prove empty airspace";
  return {
    entries: [sample],
    missing: ["unsampled_other_regions","unverified_receiver_coverage"],
    detail: "ADS-B " + (primary ? "priority" : "context") + " sample in " + region[0]
      + "; coverage and unsampled areas remain unknown",
  };
}

async function aviationRegion([area, lat, lon, requestedRadius], slot, env) {
  if (![lat,lon,requestedRadius].every(Number.isFinite) || requestedRadius <= 0) throw new Error("unexpected ADS-B region");
  const radius = Math.min(250, requestedRadius);
  const provider = "adsb.lol";
  const url = "https://api.adsb.lol/v2/point/" + [lat,lon,radius].join("/");
  const data = await providerGet(env, provider, url);
  const types = {}, unique = new Set();
  let missingCallsign=0,militaryFlagged=0,airliftTypes=0,tankerTypes=0;
  for (const aircraft of data.ac) {
    if (!aircraft.hex || unique.has(aircraft.hex)) continue;
    unique.add(aircraft.hex);
    const type = /^[A-Z0-9]{2,5}$/.test(aircraft.t) ? aircraft.t : "unknown";
    types[type] = (types[type] || 0) + 1;
    if (!String(aircraft.flight||"").trim())missingCallsign++;
    if ((Number(aircraft.dbFlags)&1)===1)militaryFlagged++;
    if (AIRLIFT_TYPES.has(type))airliftTypes++;
    if (TANKER_TYPES.has(type))tankerTypes++;
  }
  return item(area + "/" + slot, { url, provider, area, radius_nm: radius,
    requested_radius_nm: requestedRadius, coverage_limited: radius < requestedRadius,
    snapshot_at: data.now < 1e12 ? data.now * 1000 : data.now,
    observed_aircraft: unique.size, types,missing_callsign:missingCallsign,
    military_db_flagged:militaryFlagged,airlift_type_observed:airliftTypes,tanker_type_observed:tankerTypes,
    sample_status: unique.size ? "aircraft_observed" : "zero_in_sample" });
}

// Keep 48 AvioADSB requests/day: 32 focus, 16 context; never bypass provider quotas.
async function aviationAlternative(env, slot) {
  const { focus, context } = airSamplingRegions(env);
  const turn = Math.floor(slot / (30 * MINUTE)), primary = turn % 3 !== 2;
  const quota=await env.DB.prepare("SELECT remaining,reset_at,checked_at FROM worker_provider_quota WHERE provider=?")
    .bind("avioadsb.org").first().catch(()=>null);
  if (quota && quota.reset_at>Date.now()) {
    // Shared-network quota is not ours alone: preserve the remaining requests for Tehran.
    const skip=quota.remaining===0 || (quota.remaining<=4 ? turn%6!==0
      : quota.remaining<=12 ? turn%3!==0
      : quota.remaining<=28 && !primary);
    if (skip) return {entries:[],missing:["quota_reserved_for_tehran"],
      detail:"AvioADSB sample skipped under shared-network quota pressure; "+
        quota.remaining+" requests remain until "+new Date(quota.reset_at).toISOString()};
  }
  const [area,lat,lon,requestedRadius] = primary
    ? focus : context[Math.floor(turn / 3) % context.length];
  if (![lat,lon,requestedRadius].every(Number.isFinite) || requestedRadius <= 0) {
    throw new Error("invalid alternate ADS-B regional coordinates");
  }
  const radius = Math.min(100, requestedRadius);
  const url = "https://avioadsb.org/v1/point/" + [lat,lon,radius].join("/");
  const data = await providerGet(env,"avioadsb.org",url);
  const unique = new Set(), types = {};
  let missingCallsign=0,militaryFlagged=0,airliftTypes=0,tankerTypes=0;
  for (const plane of data.ac) {
    const hex = String(plane.hex || "").toLowerCase();
    if (!/^[a-f0-9]{6}$/.test(hex) || unique.has(hex)) continue;
    unique.add(hex);
    const type = /^[A-Z0-9]{2,5}$/.test(plane.t || "") ? plane.t : "unknown";
    types[type] = (types[type] || 0) + 1;
    if (!String(plane.flight||"").trim())missingCallsign++;
    if ((Number(plane.dbFlags)&1)===1)militaryFlagged++;
    if (AIRLIFT_TYPES.has(type))airliftTypes++;
    if (TANKER_TYPES.has(type))tankerTypes++;
  }
  return {
    entries: [item(area + "/" + slot, {
      provider:"avioadsb.org",url,area,radius_nm:radius,
      requested_radius_nm:requestedRadius,
      coverage_limited:radius<requestedRadius,
      sampled_only:true,receiver_coverage_unverified:true,
      sampling_priority:primary ? "primary" : "context",
      sample_interval_minutes:30,
      expected_same_region_interval_minutes:primary ? 60 : 90*context.length,
      snapshot_at:data.now<1e12 ? data.now*1000 : data.now,
      observed_aircraft:unique.size,types,missing_callsign:missingCallsign,
      military_db_flagged:militaryFlagged,airlift_type_observed:airliftTypes,tanker_type_observed:tankerTypes,
      sample_status:unique.size ? "aircraft_observed" : "zero_in_sample",
      attribution:"Data: AvioADSB (CC BY-NC 4.0)",
      attribution_url:"https://avioadsb.org",
      license:"CC BY-NC 4.0 — noncommercial use",
      caveat:"Zero means none reported in this receiver-network sample, not empty airspace. Other regions and receiver completeness unknown.",
    })],
    missing:["unsampled_other_regions","unverified_receiver_coverage"],
    detail:"AvioADSB " + (primary ? "priority" : "context") + " sample in "
      + area + " (<=100 NM); receiver coverage unverified",
  };
}

// 24 low-frequency context snapshots/day; Tehran's existing priority budget is unchanged.
// One <=100 NM receiver snapshot cannot establish a transatlantic flight or origin/destination.
async function airbridgeContext(env,slot) {
  const now=Date.now();
  const quota=await env.DB.prepare("SELECT remaining,reset_at,checked_at FROM worker_provider_quota WHERE provider=?")
    .bind("avioadsb.org").first().catch(()=>null);
  if (quota && quota.reset_at>now && quota.remaining<=28)
    return {entries:[],missing:["quota_reserved_for_tehran"],
      detail:"Air corridor snapshot skipped: reserve AvioADSB quota for Tehran"};
  const [area,lat,lon]=AIRBRIDGE_REGIONS[Math.floor(slot/HOUR)%AIRBRIDGE_REGIONS.length];
  const radius=100, url="https://avioadsb.org/v1/point/"+[lat,lon,radius].join("/");
  const data=await providerGet(env,"avioadsb.org",url);
  const seen=new Set(), logisticsTypes={};
  let airlift=0,tankers=0,flagged=0,flaggedLogistics=0,noType=0;
  for (const plane of data.ac) {
    const hex=String(plane.hex||"").toLowerCase();
    if (!/^[a-f0-9]{6}$/.test(hex)||seen.has(hex))continue;
    seen.add(hex);
    const type=String(plane.t||"").toUpperCase();
    const isAirlift=AIRLIFT_TYPES.has(type),isTanker=TANKER_TYPES.has(type);
    const isFlagged=(Number(plane.dbFlags)&1)===1;
    if(!type)noType++;
    if(isAirlift)airlift++;
    if(isTanker)tankers++;
    if(isFlagged)flagged++;
    if(isFlagged&&(isAirlift||isTanker))flaggedLogistics++;
    if(isAirlift||isTanker)logisticsTypes[type]=(logisticsTypes[type]||0)+1;
  }
  return {entries:[item(area+"/"+slot,{
    provider:"avioadsb.org",url,area,radius_nm:radius,snapshot_at:data.now<1e12?data.now*1000:data.now,
    observed_aircraft:seen.size,airlift_type_observed:airlift,tanker_type_observed:tankers,
    military_db_flagged:flagged,flagged_logistics_type:flaggedLogistics,unknown_type:noType,
    logistics_types:logisticsTypes,sample_status:seen.size?"aircraft_observed":"zero_in_sample",
    evidence_grade:"single_snapshot_only",receiver_coverage_unverified:true,
    attribution:"Data: AvioADSB (CC BY-NC 4.0)",attribution_url:"https://avioadsb.org",
    license:"CC BY-NC 4.0 — noncommercial use",
    caveat:"100 NM snapshot cannot establish origin, destination, route, unique flights or US military affiliation. Database flags and types are imperfect hints."
  })],missing:["route_not_observable","receiver_coverage_unverified"],
    detail:"Air corridor context in "+area+"; snapshot counts are not transatlantic movements"};
}

async function airBulletins() {
  const xml = await get(EASA, "text");
  const entries = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if (!entries.length) throw new Error("EASA feed returned no items");
  const bulletins = entries.flatMap(([, entry]) => {
    const field = name => textOnly(entry.match(new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)</" + name + ">", "i"))?.[1]);
    const url = href(field("link"), EASA);
    const title = field("title");
    if (!url || !title) return [];
    return [item(url, { title, url, area: title, published: field("pubDate") || null,
      description: field("description") || null })];
  });
  return bulletins.filter(({ payload }) =>
    /\b(iran|iraq|persian gulf|gulf of oman|hormuz|bahrain|kuwait|qatar|emirates|saudi arabia|oman)\b/i.test(payload.title)
  );
}

async function seaBulletins() {
  const html = await get(MSCIO, "text");
  const links = new Map();
  for (const [, path] of html.matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)) {
    const url = href(path, MSCIO);
    if (!url || !/\/media\/documents\//i.test(url)) continue;
    const doc = new URL(url);
    doc.search = "";
    links.set(doc.href, item(doc.href, { url: doc.href, area: "regional maritime advisories",
      title: decodeURIComponent(doc.pathname.split("/").pop()) }));
  }
  if (!links.size) throw new Error("MSCIO catalog returned no PDF links");
  return [...links.values()];
}

async function outages(env, slot) {
  const country = settings(env).country;
  const url = new URL(IODA);
  url.search = new URLSearchParams({
    entityType: "country", entityCode: country,
    from: String(Math.floor((slot - 24 * HOUR) / 1000)), until: String(Math.floor(slot / 1000)),
  });
  const data = await get(url, "json");
  if (data.error || !Array.isArray(data.data)) throw new Error("unexpected IODA response");
  return data.data.flatMap(event => {
    if (!Number.isFinite(event.start) || !event.datasource) return [];
    return [item(country + "/" + event.datasource + "/" + event.start, {
      url: "https://ioda.inetintel.cc.gatech.edu/country/" + country,
      area: country, signal: event.datasource, start: event.start,
      duration: event.duration ?? null, severity: event.severity ?? event.score ?? null,
    })];
  });
}

async function hotspots(env, slot) {
  const area = settings(env).firms.join(",");
  const base = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/";
  const csv = await get(base + encodeURIComponent(env.FIRMS_KEY) + "/VIIRS_NOAA20_NRT/" + area + "/1", "text");
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  const cols = header.split(",");
  if (!cols.includes("latitude") || !cols.includes("acq_date")) throw new Error("unexpected FIRMS response");
  const groups = {};
  for (const row of rows) {
    const cells = row.split(",");
    const lat = Number(cells[cols.indexOf("latitude")]);
    const lon = Number(cells[cols.indexOf("longitude")]);
    const date = cells[cols.indexOf("acq_date")];
    if (!date || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const grid = date + "/" + Math.floor(lat) + "/" + Math.floor(lon);
    groups[grid] = (groups[grid] || 0) + 1;
  }

  // Keep the legacy 1-degree summary, but also retain smaller gridded, time-aware
  // thermal observations. FRP is thermal radiative power, not evidence of an attack.
  const columns=name=>cols.indexOf(name);
  const tiny=new Map();
  for(const row of rows.slice(0,18000)){
    const c=row.split(',');
    const lat=Number(c[columns('latitude')]),lon=Number(c[columns('longitude')]);
    const date=c[columns('acq_date')],time=c[columns('acq_time')]||'';
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const cell=[date,(Math.floor(lat*10)/10).toFixed(1),(Math.floor(lon*10)/10).toFixed(1)].join('/');
    let d=tiny.get(cell);
    if(!d){d={day:date,lat:Number((Math.floor(lat*10)/10).toFixed(1)),lon:Number((Math.floor(lon*10)/10).toFixed(1)),
      hotspot_count:0,frp_sum_mw:0,night_count:0,first_utc:null,last_utc:null};
      tiny.set(cell,d);}
    d.hotspot_count++;
    const frp=Number(c[columns('frp')]);
    if(Number.isFinite(frp)&&frp>=0&&frp<5000)d.frp_sum_mw+=frp;
    if(c[columns('daynight')]==='N')d.night_count++;
    const moment=date+'T'+String(time).padStart(4,'0').slice(0,2)+':'+String(time).padStart(4,'0').slice(2,4)+':00Z';
    if(!d.first_utc||moment<d.first_utc)d.first_utc=moment;
    if(!d.last_utc||moment>d.last_utc)d.last_utc=moment;
  }
  const clusters=[...tiny.values()].map(x=>({...x,frp_sum_mw:Math.round(x.frp_sum_mw*10)/10}))
    .sort((a,b)=>b.hotspot_count-a.hotspot_count).slice(0,50);

  return [item(slot, { url: "https://firms.modaps.eosdis.nasa.gov/map/", area,
    satellite: "VIIRS_NOAA20_NRT", counts_by_day_and_degree: groups,
    analysis_type:'firms_viirs_thermal_clusters',grid_resolution_degrees:0.1,
    detected_pixels:rows.length,clusters_0_1deg:clusters,
    caveat:'Hot pixels include fires, industrial heat and satellite artifacts. They do not verify attacks or explosions.',
    data_time_utc:'per cluster',attribution:'NASA FIRMS' })];
}

async function vessels(env, slot) {
  const [west, south, east, north] = settings(env).marine;
  const start = Date.now();
  const socket = new WebSocket(AIS);
  socket.binaryType = "arraybuffer";
  let accepted = false;
  let compressed = null;
  let opened = null;
  let finished = false;
  const observed = new Set();
  await new Promise((resolve, reject) => {
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (socket.readyState < 2) socket.close();
      if (error) reject(new Error(error));
      else resolve();
    }
    const timer = setTimeout(() => finish(accepted ? null : "AIS subscription not confirmed"), 18_000);
    socket.addEventListener("open", () => {
      opened = Date.now();
      socket.send(JSON.stringify({
        APIKey: env.AIS_KEY, BoundingBoxes: [[[south, west], [north, east]]],
        FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"],
      }));
    });
    socket.addEventListener("message", event => {
      let message;
      try {
        message = JSON.parse(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data));
      } catch { return; }
      if (message.MessageType === "SubscriptionConfirmation") {
        accepted = true;
        compressed = message.Message?.SubscriptionConfirmation?.CompressionEnabled
          ?? message.Message?.CompressionEnabled ?? null;
      }
      if (message.MetaData?.MMSI) observed.add(String(message.MetaData.MMSI));
      if (accepted && observed.size >= 300) finish();
    });
    socket.addEventListener("error", () => finish("AIS connection error"));
    socket.addEventListener("close", () => finish("AIS connection closed early"));
  });
  return [item(slot, {
    url: "https://aisstream.io/", area: [west, south, east, north], observed_vessels: observed.size,
    connected_at: opened, ended_at: Date.now(), elapsed_ms: Date.now() - start,
    sample_ms: opened === null ? null : Date.now() - opened,
    compressed, sample_capped: observed.size >= 300,
  })];
}


// Military-registered aircraft in broad overlapping regional boxes.
// Stable ICAO identifiers enable de-duplication; exact positions are not persisted.
const MIL_ZONES = [
  ["israel_jordan",29.0,33.0,34.5,40.0],
  ["syria_iraq",29.0,35.0,38.5,49.0],
  ["western_iran",27.5,44.0,36.0,54.0],
  ["central_eastern_iran",29.0,51.0,39.5,64.0],
  ["persian_gulf",22.0,47.0,30.0,59.0],
  ["gulf_of_oman",19.0,55.0,27.0,65.0],
  ["red_sea",12.0,31.0,29.5,45.0],
  ["eastern_mediterranean",29.5,29.0,37.0,37.0],
];

function militaryFeed(provider, url) {
  return async function militarySnapshot(env, slot) {
    const data = await providerGet(env, provider, url);
    if (!Array.isArray(data.ac)) throw new Error("unexpected military ADS-B response");
    const all = new Set();
    const byArea = Object.fromEntries(MIL_ZONES.map(([name]) =>
      [name, { observed_aircraft: 0, types: {}, aircraft_ids: [] }]));
    const byId = new Set();
    let stale_positions = 0;
    let unpositioned = 0;
    for (const plane of data.ac) {
      const hex = String(plane.hex || "").toLowerCase();
      if (!/^[a-f0-9]{6}$/.test(hex) || byId.has(hex)) continue;
      byId.add(hex);
      if (!Number.isFinite(plane.lat) || !Number.isFinite(plane.lon)) { unpositioned++; continue; }
      if ((Number.isFinite(plane.seen_pos) && plane.seen_pos > 180) ||
          (Number.isFinite(plane.seen) && plane.seen > 180)) { stale_positions++; continue; }
      const type = /^[A-Z0-9]{2,5}$/.test(plane.t || "") ? plane.t : "unknown";
      let matched = false;
      for (const [name, south, west, north, east] of MIL_ZONES) {
        if (plane.lat < south || plane.lat > north || plane.lon < west || plane.lon > east) continue;
        const area = byArea[name];
        area.aircraft_ids.push(hex);
        area.types[type] = (area.types[type] || 0) + 1;
        area.observed_aircraft++;
        matched = true;
      }
      if (matched) all.add(hex);
    }
    for (const area of Object.values(byArea)) area.aircraft_ids.sort();
    return [item("regional/" + slot, {
      url, provider, snapshot_at: Number.isFinite(data.now) ? data.now : slot,
      global_tagged_aircraft: data.ac.length,
      unique_regional_aircraft: all.size,
      regional_aircraft_ids: [...all].sort(),
      unpositioned_global: unpositioned, stale_positions_global: stale_positions,
      area_counts_overlap: true, areas: byArea,
      limitations: "Tagged as military by provider, not all military flights; broad geographic boxes overlap. No exact positions or tracks stored.",
    })];
  };
}

const militaryLol = militaryFeed("adsb.lol", "https://api.adsb.lol/v2/mil");


const STATE_FEED = "https://travel.state.gov/_res/rss/TAsTWs.xml";
const STATE_REGION = /\b(israel|gaza|west bank|iran|iraq|jordan|lebanon|syria|saudi arabia|bahrain|kuwait|qatar|oman|united arab emirates|yemen|egypt|turkey|cyprus)\b/i;

// Country Travel Advisories; not a complete feed of embassy security alerts or evacuations.
async function stateTravelAdvisories() {
  const xml = await get(STATE_FEED, "text");
  if (!/<rss\b/i.test(xml) || !/<item\b/i.test(xml))
    throw new Error("unexpected State Department RSS response");
  const entries = [];
  let relevant = 0;
  for (const [, body] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const field = tag => textOnly(body.match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i"))?.[1]);
    const title = field("title");
    if (!title || !STATE_REGION.test(title)) continue;
    relevant++;
    const linkText = field("link");
    const url = href(linkText?.replace(/^http:\/\//i, "https://"), STATE_FEED);
    if (!url) continue;
    entries.push(item(url, {
      url, title, published: field("pubDate") || null,
      description: field("description") || null,
      source_feed: STATE_FEED,
      coverage: "US State Department travel advisories, not an exhaustive embassy alert feed"
    }));
    if (entries.length >= 40) break;
  }
  if (relevant > 0 && !entries.length)
    throw new Error("unexpected State Department RSS links");
  return entries;
}


// FCDO regional guidance (GOV.UK Content API).
const FCDO_COUNTRIES=["israel","iran","lebanon","syria","iraq","jordan","saudi-arabia","united-arab-emirates"];
async function fcdoAdvice() {
  const results=await Promise.allSettled(FCDO_COUNTRIES.map(async country=>{
    const data=await get("https://www.gov.uk/api/content/foreign-travel-advice/"+country,"json");
    if(!data||typeof data!=="object"||!data.title||!data.details) throw new Error("unexpected FCDO country response");
    const d=data.details;
    const sections=Array.isArray(d.parts)?d.parts:[];
    const alerts=Array.isArray(d.alert_status)?d.alert_status.map(x=>textOnly(String(x))).slice(0,6)
      :d.alert_status?[textOnly(String(d.alert_status))]:[];
    const security=sections.filter(x=>/safety|security|terror|political|regional|entry|summary/i.test(x.title||""))
      .slice(0,3).map(x=>({heading:String(x.title||"").slice(0,80),summary:textOnly(String(x.body||""))}));
    return item(country,{url:"https://www.gov.uk/foreign-travel-advice/"+country,country,
      title:String(data.title).slice(0,180),published_at:data.first_published_at||null,
      updated_at:data.public_updated_at||null,change_description:textOnly(String(d.change_description||"")),
      alert_status:alerts,security_sections:security,
      caveat:"Travel guidance can lag security actions; not real-time confirmation."});
  }));
  const entries=results.flatMap(x=>x.status==="fulfilled"?[x.value]:[]);
  const missing=FCDO_COUNTRIES.filter((_,i)=>results[i].status==="rejected");
  if(!entries.length)throw new Error("upstream FCDO country responses unavailable");
  return {entries,missing};
}


const US_DOD_RSS_URL="https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10";
async function dodOfficialRss(){
  const xml=await get(US_DOD_RSS_URL,"text");
  if(!/<rss\b/i.test(xml)||!/<item\b/i.test(xml))throw new Error("unexpected US DoD news RSS response");
  const entries=[];
  for(const [,body]of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
    const field=tag=>textOnly(body.match(new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)</"+tag+">","i"))?.[1]);
    const title=field("title");
    if(!title||!/\b(centcom|central command|iran|israel|iraq|syria|lebanon|hormuz|middle east|red sea|gulf|missile|air defense|evacuat|counterterrorism|force posture)\b/i.test(title))continue;
    let url=null;
    try{const u=new URL(field("link"),US_DOD_RSS_URL);if(u.protocol==="https:"&&["www.war.gov","war.gov","www.defense.gov","defense.gov"].includes(u.hostname))url=u.href;}catch{}
    if(!url)continue;
    entries.push(item(url,{url,title,published_at:field("pubDate")||null,
      source_feed:US_DOD_RSS_URL,source_type:"US Department of Defense official RSS (not exclusively CENTCOM)",
      caveat:"General Pentagon RSS; only overlapping subjects extracted. Absence is not evidence of inactivity by CENTCOM."}));
    if(entries.length>=10)break;
  }
  return entries;
}

const IDF_TELEGRAM_URL = "https://t.me/s/idfofficial";
async function idfReleases() {
  const html = await get(IDF_TELEGRAM_URL,"text");
  if (!html.includes("tgme_widget_message")) throw new Error("unexpected official IDF Telegram channel response");
  const entries = [];
  for (const chunk of html.split(/<div\s+class="tgme_widget_message_wrap[^"]*"[^>]*>/i).slice(1)) {
    const key = chunk.match(/\bdata-post="(idfofficial\/\d+)"/i)?.[1];
    if (!key) continue;
    const fragment = chunk.match(/<div\s+class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const summary = textOnly(fragment);
    if (!summary) continue;
    const timestamp = chunk.match(/<time\b[^>]*datetime="([^"]+)"/i)?.[1] || null;
    entries.push(item(key, {
      url: "https://t.me/" + key, title: summary.slice(0,180),
      excerpt: summary.slice(0,400), published_at: timestamp,
      source_channel: IDF_TELEGRAM_URL, source_type:"official_idf_telegram",
      caveat:"Public official IDF channel; not exhaustive and not a substitute for Home Front Command emergency alerts."
    }));
    if (entries.length >= 30) break;
  }
  if (!entries.length) throw new Error("unexpected IDF Telegram post format");
  return entries;
}

const POLY_QUERIES=["Iran","Israel"];
async function polymarketSnapshots(env,slot){
  const results=await Promise.allSettled(POLY_QUERIES.map(async q=>{
    const url="https://gamma-api.polymarket.com/public-search?q="+encodeURIComponent(q)+"&limit_per_type=12&events_status=active&search_profiles=false";
    const data=await get(url,"json");
    if(!data||!Array.isArray(data.events))throw new Error("unexpected Polymarket search response");
    return data.events;
  }));
  const missing=POLY_QUERIES.filter((_,i)=>results[i].status==="rejected");
  if(missing.length===POLY_QUERIES.length)throw new Error("upstream Polymarket search unavailable");
  const entries=[],seen=new Set();
  for(const r of results){
    if(r.status!=="fulfilled")continue;
    for(const event of r.value){
      const title=String(event.title||"");
      if(!/\b(iran|israel|hormuz|hezbollah|lebanon|middle east|gulf|houthi)\b/i.test(title))continue;
      if(event.closed||!event.active)continue;
      for(const m of Array.isArray(event.markets)?event.markets.slice(0,15):[]){
        if(entries.length>=45)break;
        if(m.closed||!m.active||!m.id||!event.id)continue;
        const endAt=Date.parse(String(m.endDate||event.endDate||""));
        if(Number.isFinite(endAt)&&endAt<=Date.now())continue;
        const k=String(event.id)+"/"+String(m.id);
        if(seen.has(k))continue;
        seen.add(k);
        let outcomes=m.outcomes,prices=m.outcomePrices;
        try{if(typeof outcomes==="string")outcomes=JSON.parse(outcomes)}catch{}
        try{if(typeof prices==="string")prices=JSON.parse(prices)}catch{}
        const numeric=Array.isArray(prices)?prices.slice(0,8).map(x=>Number.isFinite(Number(x))?Number(x):null):[];
        entries.push(item(k+"/"+slot,{
          url:"https://polymarket.com/event/"+encodeURIComponent(String(event.slug||"")),
          event_id:String(event.id),market_id:String(m.id),
          event:title.slice(0,200),question:String(m.question||"").slice(0,240),
          outcomes:Array.isArray(outcomes)?outcomes.slice(0,8):[],
          outcome_prices:numeric,volume_24h:Number(m.volume24hr||event.volume24hr||0),
          liquidity:Number(m.liquidity||0),ends_at:m.endDate||event.endDate||null,
          source:"Polymarket Gamma public-search",snapshot_at:slot,
          caveat:"Market prices reflect trader sentiment and settlement rules; not verified evidence of impending attacks."
        }));
      }
      if(entries.length>=45)break;
    }
  }
  return {entries,missing};
}

// The official news RSS is reachable, but may stop publishing for months.
// Never promote an archival item to a new event just because polling resumed.
const CENTCOM_RSS = "https://www.centcom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=808&max=20";
async function centcomRss(env, slot) {
  const xml = await get(CENTCOM_RSS, "text");
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) throw new Error("unexpected CENTCOM RSS response");
  const parsed = [];
  for (const [, body] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const field = tag => textOnly(body.match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i"))?.[1]);
    const title = field("title"), url = href(field("link"), CENTCOM_RSS);
    const published = Date.parse(field("pubDate"));
    if (!title || !url || !Number.isFinite(published) || published > slot + 5 * MINUTE) continue;
    parsed.push(item(url, {url, title, published_at:new Date(published).toISOString(),
      source_feed:CENTCOM_RSS, source_type:"official_centcom_news_rss",
      caveat:"Official news RSS only; may be archival. Poll time is not publication time; not a complete operations or press-release feed."}));
  }
  if (!parsed.length) throw new Error("unexpected CENTCOM RSS: no valid official dated items");
  const latest = Math.max(...parsed.map(x => Date.parse(x.payload.published_at)));
  const entries = parsed.filter(x => Date.parse(x.payload.published_at) >= slot - 30 * 24 * HOUR);
  return {entries, missing:entries.length ? [] : ["recent_publications"],
    detail:entries.length ? null : "RSS reachable but archival; latest publication " + new Date(latest).toISOString() + "; no items within 30 days. Not current coverage."};
}

// Public GitHub mirror of the official DVIDS Central Command Public Affairs unit feed.
// The GitHub Action fetches DVIDS directly; this Worker never requests blocked DVIDS URLs.
const CENTCOM_DVIDS_FEED = "https://www.dvidshub.net/rss/unit/72";
const CENTCOM_BRIDGE_NEWS = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/centcom-news.json";
const CENTCOM_BRIDGE_STATUS = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/centcom-status.json";

async function centcomDvids(env, slot) {
  const [snapshot, heartbeat] = await Promise.all([
    get(CENTCOM_BRIDGE_NEWS, "json"),
    get(CENTCOM_BRIDGE_STATUS, "json"),
  ]);
  if (!snapshot || snapshot.source !== "centcom_dvids"
      || snapshot.source_feed !== CENTCOM_DVIDS_FEED
      || !Array.isArray(snapshot.items)
      || snapshot.items.length > 50
      || snapshot.count !== snapshot.items.length
      || !heartbeat || heartbeat.source !== "centcom_dvids"
      || heartbeat.source_feed !== CENTCOM_DVIDS_FEED) {
    throw new Error("unexpected CENTCOM DVIDS GitHub feed structure");
  }
  const checkedAt = Date.parse(heartbeat.checked_at);
  if (!Number.isFinite(checkedAt) || checkedAt > slot + 10 * MINUTE) {
    throw new Error("unexpected CENTCOM DVIDS heartbeat date");
  }
  if (slot - checkedAt > 6 * HOUR) {
    return { entries: [], missing: ["heartbeat"], detail:
      "Official DVIDS GitHub collector heartbeat older than 6 hours; not current coverage." };
  }
  if (heartbeat.state !== "ok") {
    return { entries: [], missing: ["upstream_collector"], detail:
      "Official DVIDS GitHub collector status: " + String(heartbeat.state).slice(0,32)
      + "; " + String(heartbeat.detail || "").slice(0,180) };
  }
  const entries = [];
  const seen = new Set();
  for (const row of snapshot.items) {
    if (!row || typeof row.url !== "string" || typeof row.title !== "string"
        || typeof row.published_at !== "string" || row.title.length > 400) continue;
    let url;
    try {
      url = new URL(row.url);
    } catch { continue; }
    if (url.protocol !== "https:"
        || !["www.dvidshub.net","dvidshub.net"].includes(url.hostname)
        || !url.pathname.startsWith("/news/")) continue;
    const published = Date.parse(row.published_at);
    if (!Number.isFinite(published)
        || published < slot - 30 * 24 * HOUR
        || published > slot + 10 * MINUTE
        || seen.has(url.href)) continue;
    seen.add(url.href);
    entries.push(item(url.href, {
      url: url.href,
      title: row.title,
      published_at: new Date(published).toISOString(),
      source_feed: CENTCOM_DVIDS_FEED,
      source_type: "official_centcom_dvids_unit_news",
      transport: "GitHub Actions DVIDS collector; publicly verified source URL",
      caveat: "Official U.S. Central Command Public Affairs /news/ feed only; not an exhaustive CENTCOM public release feed. Publication time is not observation time.",
    }));
  }
  if (!entries.length) {
    return { entries: [], missing: ["recent_publications"], detail:
      "DVIDS collector reachable but no verified /news/ items in last 30 days." };
  }
  return { entries };
}

// NASA public context snapshots mirrored through GitHub Actions.
// These are scientific quicklooks and natural events, NOT military incident alerts.
const SATELLITE_GH_DATA = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/satellite-observations.json";
const SATELLITE_GH_STATUS = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/satellite-status.json";
async function satelliteContext(env, slot) {
  const [snapshot, status] = await Promise.all([
    get(SATELLITE_GH_DATA, "json"), get(SATELLITE_GH_STATUS, "json"),
  ]);
  if (!snapshot || snapshot.source !== "satellite_context" || !status ||
      status.source !== "satellite_context" ||
      !Array.isArray(snapshot.visual_overviews) ||
      !Array.isArray(snapshot.natural_events) ||
      snapshot.visual_overviews.length > 3 || snapshot.natural_events.length > 100) {
    throw new Error("unexpected NASA satellite GitHub snapshot");
  }
  const checked = Date.parse(status.checked_at);
  if (!Number.isFinite(checked) || checked > slot + 15 * MINUTE) {
    throw new Error("unexpected NASA satellite collector date");
  }
  if (slot - checked > 72 * HOUR) {
    return {entries:[], missing:["collector_stale"],
      detail:"NASA satellite GitHub collector has not reported in 72 hours; coverage unknown"};
  }
  if (!["ok", "partial"].includes(status.state)) {
    return {entries:[], missing:["collector_error"],
      detail:"NASA satellite collector error; no data promoted as current"};
  }
  const entries = [], seen = new Set();
  const regions = new Set(["persian_gulf","strait_of_hormuz","red_sea_south"]);
  for (const overview of snapshot.visual_overviews) {
    if (!overview || !regions.has(overview.region) ||
        !Array.isArray(overview.quicklooks) || overview.quicklooks.length > 2) continue;
    for (const quick of overview.quicklooks) {
      if (!quick || typeof quick.image_url !== "string" ||
          typeof quick.image_date !== "string" ||
          typeof quick.sha256 !== "string" ||
          !/^[a-f0-9]{64}$/i.test(quick.sha256) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(quick.image_date)) continue;
      let url;
      try { url = new URL(quick.image_url); } catch { continue; }
      const published = Date.parse(quick.image_date + "T00:00:00Z");
      if (url.protocol !== "https:" || url.hostname !== "gibs.earthdata.nasa.gov" ||
          !url.pathname.includes("/VIIRS_NOAA20_CorrectedReflectance_TrueColor/") ||
          !Number.isFinite(published) || published > slot ||
          published < slot - 30 * 24 * HOUR ||
          !Array.isArray(quick.tile_bbox_wsen) ||
          quick.tile_bbox_wsen.length !== 4 ||
          !quick.tile_bbox_wsen.every(Number.isFinite)) continue;
      const id = "gibs/" + overview.region + "/" + quick.image_date;
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push(item(id, {
        title:"NASA NOAA-20 optical overview — " + overview.region,
        url:url.href, region:overview.region, image_date:quick.image_date,
        tile_bbox_wsen:quick.tile_bbox_wsen, coverage:"center_tile_only",
        image_sha256:quick.sha256, image_bytes:quick.bytes,
        source_type:"official_nasa_gibs_satellite_quicklook",
        caveat:"Optical image metadata only. Not a military event, attack confirmation, infrastructure change, or full regional coverage.",
      }));
    }
  }
  for (const natural of snapshot.natural_events) {
    if (!natural || typeof natural.id !== "string" ||
        !/^EONET_[A-Za-z0-9_-]{1,50}$/.test(natural.id) ||
        typeof natural.title !== "string" || natural.title.length > 300) continue;
    let url;
    try { url = new URL(natural.url); } catch { continue; }
    if (url.protocol !== "https:" || url.hostname !== "eonet.gsfc.nasa.gov") continue;
    const id = "eonet/" + natural.id;
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push(item(id, {
      title:natural.title, url:url.href,
      event_date:natural.event_date || null,
      closed:natural.closed || null,
      categories:Array.isArray(natural.categories) ? natural.categories.slice(0,5) : [],
      source_type:"official_nasa_eonet_natural_event",
      caveat:"Environmental/natural event only. Not evidence of hostilities or military activity.",
    }));
  }
  const missing = status.state === "partial" ? ["partial_satellite_coverage"] : [];
  const detail = missing.length ? "NASA context partial: " + String(status.errors?.length ?? 0)
      + " reported gaps; interpret imagery and natural events separately" : null;
  return {entries,missing,detail};
}

// Public Earth Search / OpenAerialMap catalog metadata: no imagery pixels are downloaded.
// The four broad geographic boxes provide coarse context, not identified infrastructure targets.
const GEO_CATALOG_AREAS = [
  ["tehran", [50.8, 35.1, 52.0, 36.2]],
  ["strait_of_hormuz", [55.5, 25.3, 57.3, 27.4]],
  ["persian_gulf", [50.0, 25.0, 53.3, 27.7]],
  ["red_sea_south", [41.5, 12.8, 44.5, 16.5]],
];
const GEO_DAY = 24 * HOUR;
function catalogHttps(value, allowedHosts, pathPrefix = "/") {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && allowedHosts.includes(u.hostname)
      && u.pathname.startsWith(pathPrefix) ? u.href : null;
  } catch { return null; }
}
function validBbox(bbox) {
  return Array.isArray(bbox) && bbox.length === 4 &&
    bbox.every(Number.isFinite) &&
    bbox[0] >= -180 && bbox[2] <= 180 && bbox[1] >= -90 && bbox[3] <= 90 &&
    bbox[0] < bbox[2] && bbox[1] < bbox[3];
}
function bboxIntersects(a,b) {
  return validBbox(a) && validBbox(b) &&
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
// Provider-specific D1 lease/backoff: one permitted catalog lookup at a time.
async function catalogGet(env, provider, url) {
  const db = env.DB, now = Date.now();
  await db.prepare("INSERT OR IGNORE INTO worker_provider_state(provider) VALUES (?)")
    .bind(provider).run();
  const lease = now + 20000;
  const claim = await db.prepare(
    "UPDATE worker_provider_state SET lease_until=? WHERE provider=? AND next_allowed_at<=? AND lease_until<=? RETURNING failures"
  ).bind(lease, provider, now, now).first();
  if (!claim) {
    const state = await db.prepare("SELECT next_allowed_at,lease_until,last_error FROM worker_provider_state WHERE provider=?")
      .bind(provider).first();
    const until = Math.max(state?.next_allowed_at || 0, state?.lease_until || 0);
    throw new Error("upstream " + provider + " paused until " + new Date(until).toISOString());
  }
  let response, result, failure = null;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000), redirect: "manual" });
    if (!response.ok) throw new Error("upstream HTTP " + response.status);
    const size = response.headers.get("Content-Length");
    if (size !== null && Number(size) > 2_000_000) throw new Error("unexpected catalog response size");
    result = await response.json();
    if (!result || typeof result !== "object") throw new Error("unexpected catalog JSON");
  } catch (error) {
    failure = /^(upstream |unexpected )/.test(error.message) ? error.message : "upstream unavailable";
  }
  if (failure) {
    const status = response?.status || 0;
    const failures = Math.min(8, (claim.failures || 0) + 1);
    const base = status === 429 ? 6 * HOUR
      : status === 401 || status === 403 ? 24 * HOUR : HOUR;
    const delay = Math.min(48 * HOUR, base * 2 ** Math.min(4, failures - 1));
    const header = response?.headers.get("Retry-After");
    const retryTime = header && /^\d+$/.test(header) ? now + Number(header) * 1000
      : header ? Date.parse(header) : 0;
    const until = Math.max(now + delay, Number.isFinite(retryTime) ? retryTime : 0);
    await response?.body?.cancel().catch(() => {});
    await db.prepare("UPDATE worker_provider_state SET next_allowed_at=?,lease_until=0,failures=?,last_status=?,last_error=? WHERE provider=? AND lease_until=?")
      .bind(until, failures, status, failure, provider, lease).run();
    throw new Error(failure + "; " + provider + " retry after " + new Date(until).toISOString());
  }
  await db.prepare("UPDATE worker_provider_state SET next_allowed_at=?,lease_until=0,failures=0,last_status=200,last_error=NULL WHERE provider=? AND lease_until=?")
    .bind(Date.now() + 3000, provider, lease).run();
  return result;
}
async function sentinelCatalog(env, slot) {
  // Eight requests/day across 4 areas x 2 collections; no continuous tracking.
  const turn = Math.floor(slot / (3 * HOUR));
  const [area,bbox] = GEO_CATALOG_AREAS[Math.floor(turn / 2) % GEO_CATALOG_AREAS.length];
  const collection = turn % 2 === 0 ? "sentinel-2-l2a" : "sentinel-1-grd";
  const params = new URLSearchParams({
    collections:collection, bbox:bbox.join(","),
    datetime:new Date(slot - 21 * GEO_DAY).toISOString().slice(0,10) + "T00:00:00Z/..",
    limit:"8", sortby:"-properties.datetime",
  });
  const api = "https://earth-search.aws.element84.com/v1/search?" + params;
  const data = await catalogGet(env,"earth-search.aws.element84.com",api);
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features) ||
      data.features.length > 8) throw new Error("unexpected Earth Search STAC response");
  const entries=[], seen=new Set();
  for (const feature of data.features) {
    if (feature?.type !== "Feature" || feature.collection !== collection ||
        typeof feature.id !== "string" ||
        !/^[A-Za-z0-9_-]{6,160}$/.test(feature.id) ||
        seen.has(feature.id) || !bboxIntersects(feature.bbox,bbox)) continue;
    const at=Date.parse(feature.properties?.datetime);
    if (!Number.isFinite(at) || at>slot+15*MINUTE || at<slot-22*GEO_DAY) continue;
    const self=(feature.links||[]).find(x=>x.rel==="self")?.href;
    const canonical=catalogHttps(self,["earth-search.aws.element84.com"],"/v1/collections/");
    if (!canonical) continue;
    const cloud=feature.properties?.["eo:cloud_cover"];
    const preview=catalogHttps(feature.assets?.thumbnail?.href,
      ["sentinel-cogs.s3.us-west-2.amazonaws.com","sentinel1euwest.blob.core.windows.net"]);
    seen.add(feature.id);
    entries.push(item("earth/" + area + "/" + feature.id, {
      title:(collection==="sentinel-2-l2a"?"Sentinel-2 optical":"Sentinel-1 SAR")+" scene — "+area,
      area,collection,scene_id:feature.id,acquired_at:new Date(at).toISOString(),
      item_url:canonical,preview_url:preview,bbox:feature.bbox,
      cloud_cover_percent:Number.isFinite(cloud)&&cloud>=0&&cloud<=100?cloud:null,
      platform:typeof feature.properties.platform==="string"?feature.properties.platform.slice(0,40):null,
      polarizations:Array.isArray(feature.properties?.["sar:polarizations"])
        ? feature.properties["sar:polarizations"].filter(x=>["VV","VH","HH","HV"].includes(x)) : [],
      provider:"Earth Search by Element 84",metadata_only:true,
      source_type:"open_satellite_scene_catalog",
      caveat:"Discovery metadata, not an analyzed image. Tile overlap is not evidence of observed activity; no pixel comparison, object identification, or incident confirmation.",
    }));
  }
  if (data.features.length && !entries.length) throw new Error("unexpected Earth Search scene metadata");
  return {entries,missing:data.links?.some(x=>x.rel==="next")?["catalog_first_page_only"]:[],
    detail:"Limited STAC discovery page. No pixels downloaded; scene availability is not an event."};
}
async function aerialArchive(env, slot) {
  // Archival discovery: one request/day, rotating through four wide regions.
  const [area,bbox]=GEO_CATALOG_AREAS[Math.floor(slot / GEO_DAY)%GEO_CATALOG_AREAS.length];
  const params=new URLSearchParams({bbox:bbox.join(","),limit:"3"});
  const api="https://api.openaerialmap.org/meta?"+params;
  const data=await catalogGet(env,"api.openaerialmap.org",api);
  if (!data?.meta || !Array.isArray(data.results) || data.results.length>3 ||
      data.meta.provided_by!=="OpenAerialMap") throw new Error("unexpected OpenAerialMap metadata response");
  const entries=[],seen=new Set();
  for (const row of data.results) {
    if (!/^[a-f\d]{24}$/i.test(row?._id||"") || seen.has(row._id) ||
        !bboxIntersects(row.bbox,bbox)) continue;
    const acquired=Date.parse(row.acquisition_start);
    if (!Number.isFinite(acquired) || acquired>slot+GEO_DAY) continue;
    const canonical=catalogHttps(row.meta_uri,["api.openaerialmap.org"],"/meta/") ||
      "https://api.openaerialmap.org/meta/"+row._id;
    seen.add(row._id);
    entries.push(item("oam/"+area+"/"+row._id, {
      area,title:typeof row.title==="string"?row.title.slice(0,180):"OpenAerialMap archive image",
      acquired_at:new Date(acquired).toISOString(), bbox:row.bbox,
      ground_sample_distance_m:Number.isFinite(row.gsd)&&row.gsd>0?row.gsd:null,
      provider:typeof row.provider==="string"?row.provider.slice(0,150):null,
      item_url:canonical,
      catalog_license:typeof data.meta.license==="string"?data.meta.license:null,
      metadata_only:true,archive_only:true,source_type:"open_aerial_imagery_archive",
      caveat:"Archival crowdsourced aerial imagery. Acquisition date may be years old; no current conditions or military event inferred. Check individual image attribution/terms before republication.",
    }));
  }
  if (data.results.length && !entries.length) throw new Error("unexpected OpenAerialMap imagery metadata");
  return {entries,missing:[],detail:"Historical OpenAerialMap metadata only; coverage is patchy."};
}

// Hourly, source-attributed machine-coded news context from free GDELT Project data.
// GitHub Actions decompresses limited Events 2.0 archives. This is NOT verified conflict reporting.
const GDELT_GH_DATA = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/gdelt-context.json";
const GDELT_GH_STATUS = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/gdelt-status.json";
async function gdeltContext(_env, slot) {
  const [data,status] = await Promise.all([
    get(GDELT_GH_DATA,"json"),get(GDELT_GH_STATUS,"json"),
  ]);
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
const MARAD_GH_DATA = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/marad-advisories.json";
const MARAD_GH_STATUS = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/marad-status.json";
async function maradAdvisories(env, slot) {
  const [snapshot,status] = await Promise.all([
    get(MARAD_GH_DATA,"json"), get(MARAD_GH_STATUS,"json"),
  ]);
  if (!snapshot || snapshot.source !== "marad_advisories" ||
      !Array.isArray(snapshot.items) || snapshot.items.length > 80 ||
      !status || status.source !== "marad_advisories") {
    throw new Error("unexpected MARAD GitHub advisory snapshot");
  }
  const checked = Date.parse(status.checked_at);
  if (!Number.isFinite(checked) || checked > slot + 15 * MINUTE) {
    throw new Error("unexpected MARAD advisory collector date");
  }
  if (slot - checked > 36 * HOUR || status.state !== "ok") {
    return {entries:[], missing:["upstream_collector"],
      detail:"Official MARAD GitHub collector stale or unavailable; active advisories unknown"};
  }
  const entries=[], seen=new Set();
  for (const advisory of snapshot.items) {
    if (!advisory || typeof advisory.url !== "string" ||
        typeof advisory.title !== "string" || advisory.title.length > 350 ||
        !/^\d{4}-\d{3}$/.test(advisory.advisory_id) ||
        advisory.status !== "active") continue;
    let url;
    try {url=new URL(advisory.url);} catch {continue;}
    if (url.protocol !== "https:" ||
        !["maritime.dot.gov","www.maritime.dot.gov"].includes(url.hostname) ||
        !url.pathname.startsWith("/msci/") ||
        seen.has(advisory.advisory_id)) continue;
    seen.add(advisory.advisory_id);
    entries.push(item(advisory.advisory_id, {
      url:url.href,title:advisory.title,
      advisory_id:advisory.advisory_id,status:"active",
      published_at:null,
      source_type:"official_us_marad_active_advisory",
      caveat:"Official active advisory; publication timestamp is unknown. First observation is NOT a newly issued warning.",
    }));
  }
  return {entries};
}


// Global Fishing Watch v3: public metadata only, secret remains server-side.
async function gfwJson(env,path,body){
  let response;
  const headers={Authorization:'Bearer '+env.GFW_API_TOKEN,Accept:'application/json'};
  const opts={method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(18000),headers};
  if(body){headers['Content-Type']='application/json';opts.body=JSON.stringify(body)}
  try{response=await fetch('https://gateway.api.globalfishingwatch.org'+path,opts)}catch{throw Error('GFW_network_unavailable')}
  if(!response.ok)throw Error('GFW_HTTP_'+response.status);
  if(!/application\/json/i.test(response.headers.get('content-type')||''))throw Error('GFW_invalid_content_type');
  const raw=await response.text();
  if(raw.length>900000)throw Error('GFW_large_response');
  let data;try{data=JSON.parse(raw)}catch{throw Error('GFW_invalid_json')}
  if(!data||typeof data!=='object')throw Error('GFW_unexpected_json');
  return data;
}
async function gfwAuth(env,slot){
  if(!env.GFW_API_TOKEN)throw Error('GFW_token_missing');
  const data=await gfwJson(env,'/v3/vessels/search?query=7831410&datasets%5B0%5D=public-global-vessel-identity%3Alatest');
  if(!Array.isArray(data.entries))throw Error('GFW_auth_unknown_schema');
  return [item('verified-'+new Date(slot).toISOString().slice(0,10),{
    provider:'Global Fishing Watch',authentication:'ok',dataset:'public-global-vessel-identity:latest',
    tested_at:new Date(slot).toISOString(),note:'Public vessel search accepted token; separate SAR permission check required',
    documentation:'https://globalfishingwatch.org/our-apis/documentation/docs/quick-start'})];
}
async function gfwSar(env,slot){
  if(!env.GFW_API_TOKEN)throw Error('GFW_token_missing');
  const day=86400000,start=new Date(slot-13*day).toISOString().slice(0,10);
  const end=new Date(slot-6*day).toISOString().slice(0,10);
  const bbox=[55.2,24.8,59.4,28.2], [w,s,e,n]=bbox;
  const path='/v3/4wings/report?format=JSON&datasets%5B0%5D=public-global-sar-presence%3Alatest'
   +'&filters%5B0%5D='+encodeURIComponent("matched='false'")
   +'&temporal-resolution=ENTIRE&spatial-resolution=LOW&date-range='+start+'%2C'+end;
  const poly={type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]};
  const data=await gfwJson(env,path,{geojson:poly});
  if(!Array.isArray(data.entries)||data.entries.length>2)throw Error('GFW_sar_schema');
  const doc=data.entries[0]||{},key=Object.keys(doc).find(k=>k.startsWith('public-global-sar-presence:'));
  const rows=key?doc[key]:[];
  if(!Array.isArray(rows)||rows.length>1500)throw Error('GFW_sar_rows_limit');
  let detections=0,cells=0;const top=[];
  for(const r of rows){
    if(!Number.isFinite(r?.detections)||r.detections<0)continue;
    detections+=r.detections;cells++;
    if(Number.isFinite(r.lat)&&Number.isFinite(r.lon)&&r.detections>0&&r.lon>=w-1&&r.lon<=e+1&&r.lat>=s-1&&r.lat<=n+1)
      top.push({lat:r.lat,lon:r.lon,detections:r.detections,date:String(r.date||'').slice(0,22)});
  }
  top.sort((a,b)=>b.detections-a.detections);
  return [item('hormuz-unmatched-'+start+'-'+end,{
    analysis_type:'satellite_sar_unmatched_ais',provider:'Global Fishing Watch',
    dataset:'public-global-sar-presence:latest',satellite:'Sentinel-1',
    region:'Strait of Hormuz adjacent maritime zone',bbox_wsen:bbox,
    observation_start:start,observation_end:end,checked_at:new Date(slot).toISOString(),
    unmatched_ais_detections:detections,grid_cells:cells,top_grid_cells:top.slice(0,20),
    coverage:'Satellite acquisitions are spatially and temporally incomplete; updates ~5 days delayed',
    uncertainty:'Unmatched with AIS is NOT proof of AIS-off or military identity; detections are NOT unique vessels',
    source_url:'https://globalfishingwatch.org/our-apis/',
    attribution:'Global Fishing Watch',assessment:'algorithmic satellite detections, not verified incident'})];
}


// Copernicus EMS: public analysis-product metadata mirrored through GitHub (no source inference).
async function copernicusAnalysis(env,slot) {
  const base='https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/';
  let snapshot,status;
  try {[snapshot,status]=await Promise.all([get(base+'copernicus-analyses.json','json'),
    get(base+'copernicus-analyses-status.json','json')]);}
  catch {throw Error('CEMS_public_mirror_unavailable')}
  if(snapshot?.schema_version!==1||snapshot?.source!=='copernicus_ems'||
     !Array.isArray(snapshot.products)||snapshot.products.length>30||
     status?.source!=='copernicus_ems'||!['ok','partial'].includes(status.state))
     throw Error('CEMS_invalid_public_mirror');
  const checked=Date.parse(snapshot.checked_at),statusCheck=Date.parse(status.checked_at);
  if(!Number.isFinite(checked)||Math.abs(statusCheck-checked)>600000||checked>slot+3600000)
    throw Error('CEMS_invalid_mirror_time');
  if(slot-checked>36*3600000)return{entries:[],missing:['collector_stale'],
    detail:'CEMS GitHub mirror older than 36 hours; product coverage unknown'};
  const entries=[],seen=new Set();
  for(const p of snapshot.products) {
    if(!/^EMS[RN]\d{3,5}$/.test(p?.code)||seen.has(p.code)||
      typeof p.title!=='string'||p.title.length>260||
      !Array.isArray(p.countries)||p.countries.length>12)continue;
    seen.add(p.code);
    entries.push(item(p.code,{
      analysis_type:'copernicus_ems_published_product_metadata',
      provider:'Copernicus Emergency Management Service',
      activation_id:p.code,title:p.title,countries:p.countries,
      category:p.category,phase:p.phase,activation_at:p.activation_at,
      last_update:p.last_update,product_count:p.product_count,
      aoi_count:p.aoi_count,closed:!!p.closed,
      source_url:p.source_url,
      report_url:p.report_url||null,
      confidence:'official_public_activation_metadata',
      limitation:'An activation or listed mapping product does not by itself confirm physical damage or a military event.',
      collected_at:snapshot.checked_at
    }));
  }
  if(!entries.length)entries.push(item('catalog-scan-'+snapshot.checked_at.slice(0,10),{
    analysis_type:'copernicus_catalog_coverage',
    provider:'Copernicus Emergency Management Service',
    checked_at:snapshot.checked_at,matching_products:0,
    source_url:'https://mapping.emergency.copernicus.eu/activations/api/activations/',
    caveat:'No matching activations in sampled API pages is NOT evidence of no incidents or no satellite products.'}));
  return{entries,missing:status.state==='partial'?['partial_provider_coverage']:[],
    detail:status.state==='partial'?'Copernicus API coverage partial; products reflect only sampled pages':null};
}


// Public UNOSAT ArcGIS analysis layers mirrored by GitHub collector.
async function unosatAnalysis(env,slot){
  const root='https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/';
  let doc,health;
  try {[doc,health]=await Promise.all([get(root+'unosat-analysis.json','json'),get(root+'unosat-analysis-status.json','json')]);}
  catch{throw Error('UNOSAT_mirror_unavailable')}
  if(doc?.schema_version!==1||doc.source!=='unosat_analysis'||
     !Array.isArray(doc.products)||doc.products.length>24||
     health?.source!=='unosat_analysis'||!['ok','partial'].includes(health.state))
     throw Error('UNOSAT_invalid_mirror');
  const stamp=Date.parse(doc.checked_at),hstamp=Date.parse(health.checked_at);
  if(!Number.isFinite(stamp)||Math.abs(hstamp-stamp)>600000||stamp>slot+3600000)
    throw Error('UNOSAT_bad_mirror_timestamp');
  if(slot-stamp>48*3600000)return{entries:[],missing:['collector_stale'],
    detail:'UNOSAT metadata collection delayed >48 hours; coverage unknown'};
  const entries=[],unique=new Set();
  for(const p of doc.products){
    if(!p||typeof p.service_id!=='string'||p.service_id.length>160||unique.has(p.service_id)
      ||!/^https:\/\/unosatgis\.cern\.ch\/rapidmapping\/rest\/services\/[A-Za-z0-9_/-]+\/(?:MapServer|FeatureServer)$/.test(p.map_service_url||'')
      ||!['IRN','PSE','ISR','SYR','LBN','IRQ','OMN','YEM','SAU','KWT','QAT','BHR','JOR','EGY','TUR','SDN'].includes(p.region_code))continue;
    unique.add(p.service_id);
    entries.push(item(p.service_id,{
      analysis_type:'unosat_official_geospatial_analysis_layer',
      provider:'UNOSAT United Nations Satellite Centre',
      event_folder:p.event_folder,region:p.region_code,event_date:p.event_date_from_folder,
      layer_title:String(p.analysis_label||'Official analysis').slice(0,100),
      map_service_url:p.map_service_url,
      source_url:p.map_service_url,
      publication_date:null,satellite_acquisition_date:null,
      collected_at:doc.checked_at,content_status:'official_gis_service_exists',
      caveat:'Event folder date is NOT the image date or release date. Layer existence is NOT independent proof of damage.',
      attribution:'United Nations Satellite Centre / UNOSAT'
    }));
  }
  if(!entries.length)return{entries:[],missing:['no_matching_service_in_sample'],
    detail:'No public regional UNOSAT analysis layers in sampled catalogue; not proof no mapping exists'};
  return {entries,missing:health.state==='partial'?['partial_catalogue']:[],
    detail:health.state==='partial'?'UNOSAT public catalogue partially accessible':null};
}


// Separate previous-period GFW SAR sample. Raw counts are never a coverage-adjusted trend.
async function gfwSarBaseline(env,slot){
  if(!env.GFW_API_TOKEN)throw Error('GFW_token_missing');
  const day=86400000,start=new Date(slot-21*day).toISOString().slice(0,10);
  const end=new Date(slot-14*day).toISOString().slice(0,10);
  const bbox=[55.2,24.8,59.4,28.2],[w,s,e,n]=bbox;
  const path='/v3/4wings/report?format=JSON&datasets%5B0%5D=public-global-sar-presence%3Alatest'
    +'&filters%5B0%5D='+encodeURIComponent("matched='false'")
    +'&temporal-resolution=ENTIRE&spatial-resolution=LOW&date-range='+start+'%2C'+end;
  const poly={type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]};
  const reply=await gfwJson(env,path,{geojson:poly});
  if(!Array.isArray(reply.entries)||reply.entries.length>2)throw Error('GFW_baseline_invalid_entries');
  const record=reply.entries[0]||{};
  const key=Object.keys(record).find(k=>k.startsWith('public-global-sar-presence:'));
  if(!key)throw Error('GFW_baseline_dataset_missing');
  const rows=record[key];
  if(!Array.isArray(rows)||rows.length>1500)throw Error('GFW_baseline_rows_limit');
  let detections=0,cells=0;
  for(const r of rows){
    if(!Number.isFinite(r?.detections)||r.detections<0)continue;
    detections+=r.detections;cells++;
  }
  return [item('hormuz-unmatched-baseline-'+start+'-'+end,{
    analysis_type:'sar_previous_period_baseline',provider:'Global Fishing Watch',
    dataset:'public-global-sar-presence:latest',
    region:'Strait of Hormuz adjacent maritime zone',
    bbox_wsen:bbox,
    observation_start:start,observation_end:end,
    unmatched_ais_detections:detections,grid_cells:cells,
    checked_at:new Date(slot).toISOString(),
    source_url:'https://globalfishingwatch.org/our-apis/',
    confidence:'algorithmic_unverified',
    caveat:'Sampling coverage, SAR acquisitions and AIS matching vary; difference in raw counts is not a change in ship traffic.'
  })];
}

const sources = [
  {name:"gfw_sar_baseline",every:1440,secret:"GFW_API_TOKEN",read:gfwSarBaseline},
  {name:"unosat_analysis",every:720,read:unosatAnalysis},
  {name:"copernicus_ems",every:360,read:copernicusAnalysis},
  { name: "gfw_token", every: 1440, secret: "GFW_API_TOKEN", read: gfwAuth },
  { name: "gfw_sar", every: 1440, secret: "GFW_API_TOKEN", read: gfwSar },
  { name: "centcom_rss", every: 240, read: centcomRss },
  { name: "centcom_dvids", every: 30, read: centcomDvids },
  { name: "satellite_context", every: 720, read: satelliteContext },
  { name: "gdelt_context", every: 60, read: gdeltContext },
  { name: "sentinel_catalog", every: 180, read: sentinelCatalog },
  { name: "aerial_archive", every: 1440, read: aerialArchive },
  { name: "fcdo", every: 480, read: fcdoAdvice },
  { name: "marad_official", every: 360, read: maradAdvisories },
  { name: "us_dod_rss", every: 240, read: dodOfficialRss },
  { name: "idf_official", every: 120, read: idfReleases },
  { name: "polymarket", every: 360, read: polymarketSnapshots },
  { name: "state_dept", every: 480, read: stateTravelAdvisories },
  { name: "mil_lol", every: 60, read: militaryLol },
  { name: "adsb", every: 15, read: aviation },
  { name: "adsb_alt", every: 30, read: aviationAlternative },
  { name: "airbridge_context", every: 60, read: airbridgeContext },
  { name: "easa", every: 15, read: airBulletins },
  { name: "mscio", every: 15, read: seaBulletins },
  { name: "ioda", every: 15, read: outages },
  { name: "ais", every: 5, secret: "AIS_KEY", read: vessels },
  { name: "firms", every: 60, secret: "FIRMS_KEY", read: hotspots },
];

const statusSql = `INSERT INTO source_status VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(source) DO UPDATE SET attempted_at=excluded.attempted_at,
  succeeded_at=MAX(COALESCE(source_status.succeeded_at, 0), COALESCE(excluded.succeeded_at, 0)),
  state=excluded.state, detail=excluded.detail
  WHERE excluded.attempted_at >= source_status.attempted_at`;

async function collect(db, env, source, slot) {
  let result;
  try {
    result = await source.read(env, slot);
  } catch (error) {
    const detail = /^(upstream |unexpected |EASA |MSCIO |AIS |GFW_|CEMS_|UNOSAT_)/.test(error.message) ? error.message : "invalid upstream data";
    await db.prepare(statusSql).bind(source.name, slot, null, "error", detail).run();
    return;
  }
  const { entries, missing = [], detail = null } = Array.isArray(result) ? { entries: result } : result;
  const records = entries.map(({ id, payload }) => ({ id, payload: JSON.stringify(payload) }));
  const state = missing.length ? "partial" : records.length ? "ok" : "empty";
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO observations
      SELECT ?, json_extract(value,'$.id'), json_extract(value,'$.payload'), ?, json_extract(value,'$.payload')
      FROM json_each(?)`).bind(source.name, slot, JSON.stringify(records)),
    db.prepare(statusSql).bind(source.name, slot, missing.includes("quota_reserved_for_tehran") ? null : slot, state,
      missing.length ? detail || "Missing regions: " + missing.join(", ") : null),
  ]);
  if(['firms','gfw_sar','gfw_sar_baseline','copernicus_ems','unosat_analysis'].includes(source.name)){
    for(const e of entries.slice(0,35)){
      const v=e.payload||{};
      const type=String(v.analysis_type||'satellite_context');
      const region=String(v.region||v.countries?.join(', ')||v.area||'Regional coverage');
      const start=String(v.observation_start||v.activation_at||'').slice(0,60);
      const end=String(v.observation_end||v.last_update||'').slice(0,60);
      const url=String(v.source_url||v.url||'').slice(0,600);
      const caution=String(v.uncertainty||v.limitation||v.caveat||'Provisional satellite context; not an incident confirmation').slice(0,700);
      await db.prepare('INSERT OR REPLACE INTO satellite_analysis (source,artifact_id,analysis_type,region,observed_from,observed_to,source_url,interpretation,collected_at_ms,payload) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .bind(source.name,String(e.id).slice(0,180),type,region.slice(0,160),start,end,url,caution,slot,JSON.stringify(v)).run();
    }
  }
}


async function claimManualRun(db, slot) {
  const row=await db.prepare("SELECT id,sources_json FROM worker_manual_runs WHERE status='pending' AND requested_ms<=? ORDER BY requested_ms LIMIT 1").bind(slot).first();
  if (!row) return null;
  const claim=await db.prepare("UPDATE worker_manual_runs SET status='running', started_ms=? WHERE id=? AND status='pending'").bind(slot,row.id).run();
  if (claim.meta?.changes!==1) return null;
  let wanted=[];
  try {
    const parsed=JSON.parse(row.sources_json);
    if (Array.isArray(parsed)) wanted=parsed.filter(s=>typeof s==="string"&&sources.some(x=>x.name===s));
  } catch { /* malformed manual request: recorded with no sources */ }
  return {id:row.id,wanted:[...new Set(wanted)]};
}

async function runSchedule(controller, env) {
  const slot = Math.floor(controller.scheduledTime / MINUTE) * MINUTE;
  const minute = slot / MINUTE;
  // Each schedule has its own CPU budget. AIS must not delay HTTP collectors.
  const group = minute % 15 === 0 ? ["adsb"]
    : minute % 5 === 1 ? ["ais"]
    : minute % 15 === 2 ? ["easa", "mscio", "ioda"]
    : minute % 60 === 3 ? ["firms"]
    : minute % 60 === 4 ? ["mil_lol"]
    : minute % 480 === 128 ? ["state_dept"]
    : minute % 480 === 7 ? ["fcdo"]
    : minute % 240 === 8 ? ["us_dod_rss"]
    : minute % 120 === 12 ? ["idf_official"]
    : minute % 360 === 13 ? ["polymarket"]
    : [];
  const manual = await claimManualRun(env.DB, slot);
  // Added only in a previously unused slot; existing source timing is unchanged.
  const supplemental = [
    ...(minute % 240 === 18 ? ["centcom_rss"] : []),
    ...(minute % 30 === 9 ? ["centcom_dvids"] : []),
    ...(minute % 360 === 61 ? ["marad_official"] : []),
    ...(minute % 720 === 53 ? ["satellite_context"] : []),
    ...(minute % 60 === 55 ? ["gdelt_context"] : []),
    ...(minute % 180 === 44 ? ["sentinel_catalog"] : []),
    ...(minute % 1440 === 49 ? ["aerial_archive"] : []),
    ...(minute % 30 === 22 ? ["adsb_alt"] : []),
    ...(minute % 60 === 37 ? ["airbridge_context"] : []),
    ...(minute % 1440 === 51 ? ["gfw_token"] : []),
    ...(minute % 1440 === 54 ? ["gfw_sar"] : []),
    ...(minute % 1440 === 57 ? ["gfw_sar_baseline"] : []),
    ...(minute % 360 === 83 ? ["copernicus_ems"] : []),
    ...(minute % 720 === 86 ? ["unosat_analysis"] : []),
  ];
  const selected = new Set([...group,...supplemental,...(manual?.wanted || [])]);
  // Shared adsb.lol quota: skip redundant automatic attempts during cooldown.
  // While recovering, reserve the first successful probe for the Tehran-priority collector,
  // not for the broad /mil endpoint. Explicit manual requests still report their result.
  const autoAdsb = ["adsb", "mil_lol"].filter(name =>
    selected.has(name) && !(manual?.wanted || []).includes(name));
  if (autoAdsb.length) {
    const health = await env.DB.prepare(
      "SELECT failures,next_allowed_at,lease_until FROM worker_provider_state WHERE provider=?"
    ).bind("adsb.lol").first();
    const now = Date.now();
    if ((health?.next_allowed_at || 0) > now || (health?.lease_until || 0) > now) {
      for (const name of autoAdsb) selected.delete(name);
    } else if ((health?.failures || 0) > 0 && autoAdsb.includes("mil_lol")) {
      selected.delete("mil_lol");
    }
  }
  const due = sources.filter(s => selected.has(s.name) && (!s.secret || env[s.secret]));
  const results = await Promise.allSettled(due.map(source => collect(env.DB, env, source, slot)));
  if (manual) {
    const states = await env.DB.prepare("SELECT source,state,detail,attempted_at FROM source_status").all();
    const names=new Set(manual.wanted);
    const report={requested:manual.wanted, observed:(states.results||[]).filter(x=>names.has(x.source)), rejected:results.map((x,i)=>x.status==="rejected"?due[i].name:null).filter(Boolean), missing_secrets:manual.wanted.filter(name=>!due.some(x=>x.name===name))};
    await env.DB.prepare("UPDATE worker_manual_runs SET status=?, finished_ms=?, result_json=? WHERE id=? AND status='running'").bind(report.rejected.length?"partial":"done",Date.now(),JSON.stringify(report),manual.id).run();
  }
  if (minute % 1440 === 3) {
    await env.DB.prepare("DELETE FROM observations WHERE observed_at < ?").bind(slot - 90 * 24 * HOUR).run();
  }
  if (results.some(result => result.status === "rejected")) throw new Error("D1 write failed");
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}


// Public, read-only satellite analytics: no credentials, raw upstream payloads,
// sensitive monitoring feeds or keys are included in the response.
const SATELLITE_PUBLIC_ORIGIN='*'; // Whitelisted public metrics only; no credentials accepted.
const SATELLITE_PUBLIC_HEADERS={
  'Content-Type':'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':SATELLITE_PUBLIC_ORIGIN,
  'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type',
  'Access-Control-Max-Age':'86400',
  'X-Content-Type-Options':'nosniff',
  'Cache-Control':'public, max-age=60, s-maxage=180'
};
function satellitePublicResponse(payload,status=200,head=false){
  const out=JSON.stringify(payload);
  return new Response(head?null:out,{status,headers:SATELLITE_PUBLIC_HEADERS});
}
function satelliteDay(x){
  if(typeof x!=='string')return null;
  const hit=x.match(/^\d{4}-\d{2}-\d{2}/);
  return hit ? hit[0] : null;
}
function satellitePublicMetric(n){
  return Number.isFinite(n)&&n>=0&&n<1e10 ? n : null;
}
async function publicSatelliteApi(env,request){
  const method=request.method;
  if(method==='OPTIONS')return new Response(null,{status:204,headers:SATELLITE_PUBLIC_HEADERS});
  if(method!=='GET'&&method!=='HEAD')return satellitePublicResponse({error:'method_not_allowed'},405);
  const [rows,state]=await env.DB.batch([
    env.DB.prepare("SELECT source,artifact_id,analysis_type,region,observed_from,observed_to,source_url,interpretation,collected_at_ms,payload FROM satellite_analysis WHERE source IN ('firms','gfw_sar','gfw_sar_baseline','copernicus_ems','unosat_analysis') ORDER BY collected_at_ms DESC LIMIT 160"),
    env.DB.prepare("SELECT source,state,attempted_at,succeeded_at,detail FROM source_status WHERE source IN ('firms','gfw_sar','copernicus_ems','unosat_analysis')")
  ]);
  const asOf=Date.now();
  const sourceNames={firms:'NASA FIRMS',gfw_sar:'Global Fishing Watch SAR',
    copernicus_ems:'Copernicus EMS',unosat_analysis:'UNOSAT'};
  const cadenceHours={firms:1,gfw_sar:24,copernicus_ems:6,unosat_analysis:12};
  const sources=(state.results||[]).map(x=>({
    id:x.source,name:sourceNames[x.source]||x.source,
    state:x.state==='ok'?'ok':x.state==='empty'?'empty':x.state==='partial'?'partial':'unavailable',
    checked_at:x.attempted_at?new Date(x.attempted_at).toISOString():null,
    last_success_at:x.succeeded_at?new Date(x.succeeded_at).toISOString():null,
    cadence_hours:cadenceHours[x.source]||null,
    note:x.source==='copernicus_ems'?'Product catalogue is sampled and currently has partial provider coverage.'
       :x.source==='unosat_analysis'?'GIS layer metadata may be historical; presence is not verified damage.'
       :x.source==='firms'?'Thermal hotspots include industrial sources, fires and false detections.'
       :'SAR detections may be delayed and are not unique vessels or evidence of transponder switching.'
  }));
  const byName=new Map(sources.map(x=>[x.id,x]));
  for(const id of Object.keys(sourceNames)){
    if(!byName.has(id))sources.push({id,name:sourceNames[id],state:'pending',
      checked_at:null,last_success_at:null,cadence_hours:cadenceHours[id],note:'No completed observation yet'});
  }
  const parsed=[];
  for(const row of rows.results||[]){
    try{
      const data=JSON.parse(row.payload);
      if(data&&typeof data==='object')parsed.push({row,data});
    }catch{}
  }
  const unique=new Map();
  for(const {row,data} of parsed){
    const key=row.source+':'+row.artifact_id;
    if(!unique.has(key))unique.set(key,{row,data});
  }
  const all=[...unique.values()];
  const newest=(name)=>all.find(x=>x.row.source===name);
  // Publisher rule: do not turn unnormalized SAR counts, zero FIRMS samples or
  // unverified thermal pixels into user-facing incidents. Raw readings stay in D1.
  // A separate evidence/corroboration pipeline must promote a defensible claim.
  const signals=[];
  const pubNow=Date.now();
  const fresh=(value,maxAgeDays)=>{
    const date=Date.parse(value||'');
    return Number.isFinite(date)&&date<=pubNow+3600000&&date>=pubNow-maxAgeDays*86400000;
  };
  const reports=all.filter(x=>x.row.source==='unosat_analysis'&&
    x.data.analysis_type==='unosat_official_geospatial_analysis_layer'&&
    fresh(x.data.publication_date,30)&&fresh(x.data.event_date,90)).slice(0,24);
  const publishedProducts=all.filter(x=>x.row.source==='copernicus_ems'&&
    x.data.analysis_type==='copernicus_ems_published_product_metadata'&&
    Number.isInteger(x.data.product_count)&&x.data.product_count>0&&
    fresh(x.data.activation_at,90)&&fresh(x.data.last_update,30)).slice(0,30);
  const references=[
    ...publishedProducts.map(({row,data:d})=>({
      id:'copernicus:'+String(d.activation_id||row.artifact_id).slice(0,120),
      source:'Copernicus EMS',title:String(d.title||'Официальный картографический продукт').slice(0,220),
      region:Array.isArray(d.countries)?d.countries.join(', ').slice(0,130):'',
      event_date:satelliteDay(d.activation_at),
      publication_date:satelliteDay(d.last_update),
      url:typeof d.source_url==='string'&&d.source_url.startsWith('https://mapping.emergency.copernicus.eu/')?d.source_url:null,
      analysis_type:'official_activation_metadata',is_historical:true,
      caveat:'Наличие активации не подтверждает определённый ущерб.'
    })),
    ...reports.map(({row,data:d})=>({
      id:'unosat:'+String(row.artifact_id).slice(0,150),
      source:'UNOSAT',title:String(d.layer_title||'Официальный GIS-слой').slice(0,140),
      region:String(d.region||'').slice(0,20),event_date:satelliteDay(d.event_date?.replace?.(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')),
      publication_date:null,
      url:typeof d.map_service_url==='string'&&d.map_service_url.startsWith('https://unosatgis.cern.ch/rapidmapping/rest/services/')?d.map_service_url:null,
      analysis_type:'official_gis_catalogue_entry',is_historical:true,
      caveat:'Дата относится к событию. Она не является датой съёмки и не подтверждает повреждения.'
    }))
  ];
  const mostRecent=Math.max(0,...(state.results||[]).map(x=>x.succeeded_at||0));
  return satellitePublicResponse({
    schema_version:1,generated_at:new Date(asOf).toISOString(),
    status:sources.every(x=>x.state==='ok')?'ok':'partial',
    live_incident_confirmation:false,
    latest_success_at:mostRecent?new Date(mostRecent).toISOString():null,
    sources:sources.sort((a,b)=>Object.keys(sourceNames).indexOf(a.id)-Object.keys(sourceNames).indexOf(b.id)),
    signals,reference_products:references.slice(0,40),
    has_publishable_content:signals.length>0||references.length>0,
    display_policy:signals.length||references.length?'show':'hide',
    data_status:signals.length||references.length?'current_supported_material':'insufficient_publishable_evidence',
    publication_policy:'No raw radar counts, one-off aircraft samples, zero thermal reports or historical mapping catalogues are presented as current events.',
    interpretation:'Сведения являются спутниковыми измерениями и каталогами опубликованной аналитики, а не независимым подтверждением боевых действий.',
    attribution:'NASA FIRMS; Global Fishing Watch; Copernicus EMS; UNOSAT'
  },200,method==='HEAD');
}


// Public aviation safety notices: publish official recent EASA advisories only.
// Never turn a single ADS-B/AvioADSB receiver snapshot into an airspace conclusion.
async function publicAviationApi(env,request){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:SATELLITE_PUBLIC_HEADERS});
  if(!['GET','HEAD'].includes(request.method))
    return satellitePublicResponse({error:'method_not_allowed'},405);
  const [bulletins,states]=await env.DB.batch([
    env.DB.prepare("SELECT id,payload,observed_at FROM observations WHERE source='easa' ORDER BY observed_at DESC LIMIT 30"),
    env.DB.prepare("SELECT source,state,attempted_at,succeeded_at FROM source_status WHERE source IN ('easa','adsb','adsb_alt','airbridge_context')")
  ]);
  const now=Date.now();
  const maxAge=14*86400000;
  const signalMap=new Map();
  for(const row of bulletins.results||[]){
    let b;
    try{b=JSON.parse(row.payload)}catch{continue}
    const url=typeof b?.url==='string'?b.url:'';
    const title=typeof b?.title==='string'?b.title.trim().slice(0,130):'';
    const published=Date.parse(b?.published||'');
    if(!url.startsWith('https://www.easa.europa.eu/domains/air-operations/czibs/')||
       !title||!Number.isFinite(published)||published>now+3600000||now-published>maxAge)continue;
    if(signalMap.has(url))continue;
    signalMap.set(url,{
      id:'easa:'+url.split('/').pop().slice(0,50),
      category:'official_aviation_advisory',
      title:'EASA: бюллетень по безопасности воздушного пространства — '+title,
      description:'Опубликован официальный бюллетень по безопасности гражданской авиации. Актуальность и точные ограничения необходимо проверять в тексте первоисточника.',
      published_at:new Date(published).toISOString(),
      region:typeof b.area==='string'?b.area.slice(0,130):null,
      source:{name:'EASA',url},
      confidence:'official_published_bulletin',
      severity:'informational',
      caveat:'Сам факт публикации бюллетеня не означает закрытия воздушного пространства или начала военной операции.'
    });
  }
  const signals=[...signalMap.values()].sort((a,b)=>b.published_at.localeCompare(a.published_at)).slice(0,8);
  const statusMap=new Map((states.results||[]).map(x=>[x.source,x]));
  const sources=['easa','adsb','adsb_alt','airbridge_context'].map(id=>{
    const v=statusMap.get(id);
    return{id,role:id==='easa'?'official_advisories':'internal_context_only',
      state:v?.state||'unknown',
      last_checked_at:v?.attempted_at?new Date(v.attempted_at).toISOString():null,
      display_raw_samples:false};
  });
  return satellitePublicResponse({
    schema_version:1,generated_at:new Date(now).toISOString(),
    signals,sources,
    has_publishable_content:signals.length>0,
    display_policy:signals.length?'show':'hide',
    data_status:signals.length?'recent_official_bulletins':'no_recent_verified_advisory',
    interpretation:'Разрозненные ADS-B наблюдения, включая нули, остаются внутренними данными мониторинга. Они не доказывают состояние воздушного пространства.',
    attribution:'EASA'
  },200,request.method==='HEAD');
}


// Locale layer for public telemetry summaries. Provider names and machine codes stay stable.
// No unchecked machine translation on public requests; uncertain items remain hidden.
async function localizedAnalyticsResponse(response,request,kind){
  const lang=new URL(request.url).searchParams.get('lang')||'ru';
  if(!['ru','he'].includes(lang))return satellitePublicResponse({error:'unsupported_language',supported:['ru','he']},400);
  if(request.method==='OPTIONS'||request.method==='HEAD'||response.status!==200)return response;
  let data;try{data=await response.json()}catch{return response}
  data.requested_language=lang;
  data.direction=lang==='he'?'rtl':'ltr';
  if(lang==='ru')return satellitePublicResponse(data,200);
  const notes={
    firms:'נתוני חום לווייניים אינם הוכחה לתקיפה. גם מקורות תעשייתיים ושרפות גורמים לזיהויים.',
    gfw_sar:'זיהויי מכ״ם שאינם משויכים ל-AIS אינם מעידים בהכרח על כיבוי משדר או על פעילות צבאית.',
    copernicus_ems:'הקטלוג חלקי. עצם פרסום מוצר מיפוי אינו מאשר שנגרם נזק.',
    unosat_analysis:'שכבות מיפוי עשויות להיות היסטוריות; קיומן אינו מאמת אירוע חדש.',
  };
  data.sources=(data.sources||[]).map(s=>({...s,
    note:notes[s.id]||s.note,content_language:'he',
    display_raw_samples:false}));
  if(kind==='satellite'){
    // Current provider outputs are context, not verified reports. Any future
    // event-level publication requires explicitly localized, verified material.
    data.signals=[];
    data.reference_products=[];
    data.has_publishable_content=false;
    data.display_policy='hide';
    data.data_status='insufficient_publishable_evidence';
    data.interpretation='מדידות לוויין וקטלוגים של ניתוחים אינם אישור עצמאי לפעולות צבאיות.';
    data.publication_policy='אין להציג ספירות מכ״ם גולמיות, דגימות מטוסים בודדות, היעדר נקודות חום או מפות היסטוריות כאירועים עדכניים.';
  }else{
    // EASA is an official bulletin source; communicate only the fact of a
    // recent published bulletin, never invent airspace closure from ADS-B.
    data.signals=(data.signals||[]).filter(s=>s.category==='official_aviation_advisory').map(s=>({
      ...s,title:'EASA: פורסם עלון בטיחות למרחב האווירי',
      description:'פורסם עלון רשמי של הסוכנות האירופית לבטיחות תעופה. יש לבדוק את ההגבלות והעדכונים במקור הרשמי.',
      region:null,
      caveat:'פרסום עלון אינו מעיד כשלעצמו על סגירת מרחב אווירי או על תחילת מבצע צבאי.',
      content_language:'he',translation_status:'localized_template'
    }));
    data.has_publishable_content=data.signals.length>0;
    data.display_policy=data.signals.length?'show':'hide';
    data.interpretation='דגימות ADS-B חלקיות, כולל ספירה של אפס מטוסים, אינן הוכחה למצב המרחב האווירי.';
  }
  return satellitePublicResponse(data,200);
}

async function read(request, env) {
  const { pathname, searchParams } = new URL(request.url);
  if(pathname==='/api/satellite-analysis')return localizedAnalyticsResponse(await publicSatelliteApi(env,request),request,'satellite');
  if(pathname==='/api/aviation-analysis')return localizedAnalyticsResponse(await publicAviationApi(env,request),request,'aviation');
  if (request.method !== 'GET' || !['/summary','/satellite-analysis'].includes(pathname)) return json({error:'not found'},404);
  if (!env.SUMMARY_TOKEN || request.headers.get("Authorization") !== "Bearer " + env.SUMMARY_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  if(pathname==='/satellite-analysis'){
    const [list,states]=await env.DB.batch([
      env.DB.prepare('SELECT source,artifact_id,analysis_type,region,observed_from,observed_to,source_url,interpretation,collected_at_ms,payload FROM satellite_analysis ORDER BY collected_at_ms DESC LIMIT 80'),
      env.DB.prepare("SELECT source,state,attempted_at,succeeded_at,detail FROM source_status WHERE source IN ('firms','gfw_sar','copernicus_ems','unosat_analysis')")
    ]);
    return json({as_of:new Date().toISOString(),coverage:states.results||[],
      studies:(list.results||[]).map(({payload,...row})=>({...row,data:JSON.parse(payload)})),
      caveat:'Data are delayed or sampled. Thermal anomalies and SAR detections are not confirmations of military incidents.'});
  }
  const hours = Number(searchParams.get("hours") ?? 1);
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) return json({ error: "hours must be 1–24" }, 400);
  const now = Date.now();
  const [events, status, providers, aviationRows, airbridgeRows, quotas] = await env.DB.batch([
    env.DB.prepare(`SELECT source,id,observed_at,payload FROM observations
      WHERE observed_at >= ? AND observed_at <= ? ORDER BY observed_at DESC LIMIT 501`).bind(now - hours * HOUR, now),
    env.DB.prepare("SELECT * FROM source_status"),
    env.DB.prepare("SELECT provider,next_allowed_at,lease_until,failures,last_status,last_error FROM worker_provider_state"),
    env.DB.prepare("SELECT source,observed_at,payload FROM observations WHERE source IN ('adsb','adsb_alt') AND observed_at >= ? ORDER BY observed_at DESC LIMIT 200").bind(now - 24 * HOUR),
    env.DB.prepare("SELECT observed_at,payload FROM observations WHERE source='airbridge_context' AND observed_at >= ? ORDER BY observed_at DESC LIMIT 30").bind(now - 24 * HOUR),
    env.DB.prepare("SELECT provider,remaining,reset_at,checked_at FROM worker_provider_quota"),
  ]);
  const states = new Map(status.results.map(row => [row.source, row]));
  const airSamples = aviationRows.results.map(row => ({
    source:row.source, observed_at:row.observed_at, data:JSON.parse(row.payload),
  }));
  const focusArea = settings(env).air_focus[0];
  const aviationFocus = ["adsb","adsb_alt"].map(source => {
    const focusSamples = airSamples.filter(row => row.source === source && row.data.area === focusArea);
    const last = focusSamples[0], previous = focusSamples[1];
    const sourceState = states.get(source);
    const maxAge = (source === "adsb" ? 90 : 150) * MINUTE;
    const currentStatus = sourceState?.state === "error" ? "source_unavailable"
      : !last || now - last.observed_at > maxAge ? "no_recent_sample"
      : last.data.observed_aircraft === 0 ? "zero_in_sample" : "aircraft_observed";
    return {
      source, area:focusArea, status:currentStatus,
      current_count:["zero_in_sample","aircraft_observed"].includes(currentStatus)
        ? last.data.observed_aircraft : null,
      last_sample_at:last?.observed_at ?? null,
      last_sample_count:last?.data.observed_aircraft ?? null,
      sample_count_24h:focusSamples.length,
      previous_sample_at:previous?.observed_at ?? null,
      previous_sample_count:previous?.data.observed_aircraft ?? null,
      comparison:!["zero_in_sample","aircraft_observed"].includes(currentStatus) || !previous
        || last.observed_at - previous.observed_at > 3 * HOUR ? null : {
        status:"two_snapshots_only",
        gap_minutes:Math.round((last.observed_at-previous.observed_at)/MINUTE),
        count_difference:last.data.observed_aircraft-previous.data.observed_aircraft,
        evidence:"Change in provider snapshot counts only; not a flight movement or verified trend.",
      },
      receiver_coverage_verified:false,
      source_state:sourceState?.state || "pending",
      note:"Zero is a single receiver-network observation, never proof of empty airspace.",
    };
  });
  // Cross-source comparison is only meaningful for successful, near-simultaneous
  // Tehran samples. Both networks can miss aircraft, even when both report zero.
  const [focusA,focusB]=aviationFocus;
  const bothCurrent=[focusA,focusB].every(x=>x.current_count!==null);
  const sampleGap=focusA.last_sample_at!==null && focusB.last_sample_at!==null
    ? Math.abs(focusA.last_sample_at-focusB.last_sample_at) : null;
  const paired=bothCurrent && sampleGap!==null && sampleGap<=10*MINUTE;
  const aviationFocusComparison={
    area:focusArea,
    status:!paired ? "not_comparable"
      : (focusA.current_count===0)!==(focusB.current_count===0) ? "source_disagreement"
      : focusA.current_count===0 ? "both_report_zero" : "both_report_aircraft",
    sample_gap_minutes:paired ? Math.round(sampleGap/MINUTE) : null,
    compared_sources:["adsb","adsb_alt"],
    confirmed_empty_airspace:false,
    note:"Only near-simultaneous provider snapshots are compared; agreement does not verify full airspace coverage.",
  };
  const quotaMap=new Map(quotas.results.map(q=>[q.provider,q]));
  const corridorSamples=airbridgeRows.results.map(r=>({observed_at:r.observed_at,data:JSON.parse(r.payload)}));
  const airbridgeSummary=AIRBRIDGE_REGIONS.map(([area])=>{
    const samples=corridorSamples.filter(x=>x.data.area===area),latest=samples[0]||null,previous=samples[1]||null;
    const status=!latest?"no_recent_sample":now-latest.observed_at>8*HOUR?"stale_sample":"sampled";
    const comparable=status==="sampled" && previous
      && latest.observed_at-previous.observed_at<=12*HOUR
      && [latest.data.observed_aircraft,previous.data.observed_aircraft].every(Number.isFinite);
    return {area,sample_count_24h:samples.length,last_sample_at:latest?.observed_at??null,
      last_observed_aircraft:latest?.data.observed_aircraft??null,
      last_airlift_type_observed:latest?.data.airlift_type_observed??null,
      last_tanker_type_observed:latest?.data.tanker_type_observed??null,
      previous_sample_at:previous?.observed_at??null,
      previous_observed_aircraft:previous?.data.observed_aircraft??null,
      comparison:comparable ? {
        status:"two_snapshots_only",
        gap_minutes:Math.round((latest.observed_at-previous.observed_at)/MINUTE),
        count_difference:latest.data.observed_aircraft-previous.data.observed_aircraft,
        evidence:"Different point-in-time counts in one region; not arrivals, departures, unique flights, or a transit route.",
      } : null,
      flagged_logistics_snapshots_24h:samples.reduce((n,x)=>n+(x.data.flagged_logistics_type||0),0),
      status};
  });
  return json({
    aviation_focus: aviationFocus,
    aviation_focus_comparison:aviationFocusComparison,
    airbridge_context:{status:"context_only_not_route_tracking",sampling_interval_minutes:60,planned_requests_per_day:24,regions:airbridgeSummary,attribution:"Data: AvioADSB (CC BY-NC 4.0)",attribution_url:"https://avioadsb.org",note:"Independent snapshots. No origin/destination, unique flight counts or verified US military air bridge can be inferred."},
    from: now - hours * HOUR, until: now, truncated: events.results.length > 500,
    interpretation: {
      adsb: "One ADS-B sample every 15 minutes: half prioritize the configured focus area under normal operation; recovery probes exclusively prioritize Tehran. Zero in a sample is not empty airspace.",
      airbridge_context:"AvioADSB corridor context: 24 requests/day in 6 rotating 100 NM zones; counts are snapshots, not unique flights or a confirmed US air bridge. Database military flags and type hints are not proof of affiliation.",
      adsb_alt: "AvioADSB community data, up to 48 requests/day, adaptively throttled to protect Tehran when the shared-network quota is low: 32 focus, 16 context. Each <=100NM sample has unverified receiver coverage. Data: AvioADSB (CC BY-NC 4.0), https://avioadsb.org — personal/noncommercial use only.",
      centcom_rss: "Official news RSS; may be archival, not exhaustive CENTCOM coverage. Items older than 30 days excluded; stale feed is partial.",
      centcom_dvids: "Official CENTCOM Public Affairs news via DVIDS, mirrored by GitHub Actions. /news/ entries only, not all CENTCOM press releases. Check original publication dates and collector heartbeat.",
      satellite_context: "NASA GIBS NOAA-20 optical center-tile previews and NASA EONET natural events. Visual differences are not evidence of military activity. Coverage can be partial.",
      gdelt_context: "GDELT Project automated machine-coded news events from official 15-minute public exports, mirrored hourly by GitHub. These are media signals, NOT verified incidents; count and domains are not independent confirmations.",
      sentinel_catalog: "Element 84 Earth Search STAC discovery of Sentinel-1 GRD and Sentinel-2 L2A: one bounded search every 3h, four regions, metadata only. No image analysis, verified changes, or complete coverage claims.",
      aerial_archive: "OpenAerialMap historical aerial imagery catalog: one regional lookup per day, four regions; acquisitions may be years old and individual redistribution terms need checking.",
      marad_official: "Official active US MARAD maritime advisories. Collection date is NOT publication date; no event should be treated as newly issued merely by first ingestion.",
      mil_lol: "Military-tagged IDs in broad overlapping areas. Never infer sorties from samples.",
      fcdo: "Official UK travel advisories; not a real-time alert source.",
      us_dod_rss: "Official U.S. Department of Defense RSS; filtered regional coverage only, NOT an exhaustive CENTCOM feed.",
      idf_official: "Verified IDF Telegram public channel; not Home Front Command real-time warnings.",
      polymarket: "Market prices indicate sentiment, not confirmed facts or calibrated attack odds.",
      state_dept: "Country Travel Advisories; changes may lag embassy security alerts, and poll timestamps are not publication times.",
      ais: "Counts of distinct observed vessels per short sample; not transit counts.",
      firms: "Satellite heat detections do not identify a cause.",
      empty: "Successful poll without matching records; not proof of no activity.",
    },
    provider_health: providers.results.map(p => ({
      provider:p.provider, backoff_active:p.next_allowed_at > now,
      quota_remaining:quotaMap.get(p.provider)?.remaining??null,quota_reset_at:quotaMap.get(p.provider)?.reset_at??null,
      next_allowed_at:p.next_allowed_at, request_in_progress:p.lease_until > now,
      failures:p.failures, last_http_status:p.last_status, last_error:p.last_error,
    })),
    sources: sources.map(source => {
      const state = states.get(source.name);
      const enabled = !source.secret || Boolean(env[source.secret]);
      return {
        source: source.name, interval_minutes: source.every, enabled,
        state: !enabled ? "key_missing" : state?.state || "pending",
        data_quality: !enabled ? "disabled" : !state ? "unobserved"
          : state.state === "ok" ? "recent_records"
          : state.state === "partial" ? "coverage_limited"
          : state.state === "empty" ? "no_matching_records"
          : "unavailable",
        attempted_at: state?.attempted_at ?? null,
        succeeded_at: state?.succeeded_at || null,
        stale: enabled && (!state?.succeeded_at || now - state.succeeded_at > source.every * 2 * MINUTE),
        detail: state?.detail ?? null,
      };
    }),
    observations: events.results.slice(0, 500).map(({ payload, observed_at, ...row }) =>
      ({ ...row, first_seen_at: observed_at, data: JSON.parse(payload) })),
  });
}

export default {
  async scheduled(controller, env) {
    await runSchedule(controller, env);
  },
  fetch: read,
};