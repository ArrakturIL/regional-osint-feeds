import { json } from '../../api/json.js';
import { HOUR, MINUTE } from '../../config/constants.js';
import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
export const SATELLITE_GH_DATA = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/satellite-observations.json";
export const SATELLITE_GH_STATUS = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/satellite-status.json";
export async function satelliteContext(env, slot) {
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
