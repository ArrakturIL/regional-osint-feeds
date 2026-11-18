import { providerGet } from '../../network/provider-client.js';
import { item } from '../../observations/item.js';
export const MIL_ZONES = [
  ["israel_jordan",29.0,33.0,34.5,40.0],
  ["syria_iraq",29.0,35.0,38.5,49.0],
  ["western_iran",27.5,44.0,36.0,54.0],
  ["central_eastern_iran",29.0,51.0,39.5,64.0],
  ["persian_gulf",22.0,47.0,30.0,59.0],
  ["gulf_of_oman",19.0,55.0,27.0,65.0],
  ["red_sea",12.0,31.0,29.5,45.0],
  ["eastern_mediterranean",29.5,29.0,37.0,37.0],
];

export function militaryFeed(provider, url) {
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

export const militaryLol = militaryFeed("adsb.lol", "https://api.adsb.lol/v2/mil");
// adsb.lol rate-limits shared Cloudflare egress (dynamic limits); since 16.11
// its failure counter rarely returned to 0 and mil_lol was never scheduled.
// adsb.fi open data serves the same ADSBx v2 /mil schema (1 req/s; personal,
// non-commercial use; attribution with a link to adsb.fi is required).
export const militaryAdsbFi = militaryFeed("adsb.fi", "https://opendata.adsb.fi/api/v2/mil");

// adsb.lol only while it is fully healthy (its quota is reserved for the
// Tehran collector); otherwise, or if that call fails, adsb.fi in the same slot.
export async function militaryWithFallback(env, slot) {
  const s = await env.DB.prepare("SELECT failures,next_allowed_at,lease_until FROM worker_provider_state WHERE provider=?")
    .bind("adsb.lol").first().catch(() => null);
  const now = Date.now();
  const lolHealthy = !s || ((s.failures || 0) === 0 && (s.next_allowed_at || 0) <= now && (s.lease_until || 0) <= now);
  if (lolHealthy) {
    try { return await militaryLol(env, slot); } catch { /* recorded by providerGet; fall back */ }
  }
  return militaryAdsbFi(env, slot);
}
