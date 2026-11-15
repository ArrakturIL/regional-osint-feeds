import { json } from '../../api/json.js';
import { HOUR, MINUTE } from '../../config/constants.js';
import { get } from '../../network/http.js';
import { readCollectorPair } from '../../mirrors/collector-cache.js';
import { item } from '../../observations/item.js';
export const MARAD_GH_DATA = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/marad-advisories.json";
export const MARAD_GH_STATUS = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/marad-status.json";
export async function maradAdvisories(env, slot) {
  const {data:snapshot,status}=await readCollectorPair(env,'marad',MARAD_GH_DATA,MARAD_GH_STATUS,{nowMs:slot,maxAgeMs:36*HOUR});
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
