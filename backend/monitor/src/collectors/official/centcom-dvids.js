import { json } from '../../api/json.js';
import { HOUR, MINUTE } from '../../config/constants.js';
import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
export const CENTCOM_DVIDS_FEED = "https://www.dvidshub.net/rss/unit/72";
export const CENTCOM_BRIDGE_NEWS = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/centcom-news.json";
export const CENTCOM_BRIDGE_STATUS = "https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/centcom-status.json";

export async function centcomDvids(env, slot) {
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
