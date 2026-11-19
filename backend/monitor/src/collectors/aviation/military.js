import { readAdsbCache } from './adsb.js';
import { item } from '../../observations/item.js';
export const MIL_ZONES = [
  ['israel_jordan', 29.0, 33.0, 34.5, 40.0],
  ['syria_iraq', 29.0, 35.0, 38.5, 49.0],
  ['western_iran', 27.5, 44.0, 36.0, 54.0],
  ['central_eastern_iran', 29.0, 51.0, 39.5, 64.0],
  ['persian_gulf', 22.0, 47.0, 30.0, 59.0],
  ['gulf_of_oman', 19.0, 55.0, 27.0, 65.0],
  ['red_sea', 12.0, 31.0, 29.5, 45.0],
  ['eastern_mediterranean', 29.5, 29.0, 37.0, 37.0],
];

// Aggregates one cached global military-tagged snapshot (adsb-mil.yml: adsb.lol,
// else adsb.fi from GitHub runners) into the broad regional boxes above.
export function militarySummary(data, slot, collectedAt) {
  if (!Array.isArray(data.ac)) throw new Error('unexpected military ADS-B response');
  const all = new Set();
  const byArea = Object.fromEntries(
    MIL_ZONES.map(([name]) => [name, { observed_aircraft: 0, types: {}, aircraft_ids: [] }]),
  );
  const byId = new Set();
  let stale_positions = 0;
  let unpositioned = 0;
  for (const plane of data.ac) {
    const hex = String(plane?.hex || '').toLowerCase();
    if (!/^[a-f0-9]{6}$/.test(hex) || byId.has(hex)) continue;
    byId.add(hex);
    if (!Number.isFinite(plane.lat) || !Number.isFinite(plane.lon)) {
      unpositioned++;
      continue;
    }
    if (
      (Number.isFinite(plane.seen_pos) && plane.seen_pos > 180) ||
      (Number.isFinite(plane.seen) && plane.seen > 180)
    ) {
      stale_positions++;
      continue;
    }
    const type = /^[A-Z0-9]{2,5}$/.test(plane.t || '') ? plane.t : 'unknown';
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
  return item('regional/' + slot, {
    url: data.url,
    provider: data.provider,
    collected_via: 'github_actions',
    collected_at: collectedAt,
    snapshot_at: Number.isFinite(data.now_ms) ? data.now_ms : slot,
    global_tagged_aircraft: Number.isInteger(data.global_tagged_aircraft)
      ? data.global_tagged_aircraft
      : data.ac.length,
    unique_regional_aircraft: all.size,
    regional_aircraft_ids: [...all].sort(),
    unpositioned_global: unpositioned,
    stale_positions_global: stale_positions,
    area_counts_overlap: true,
    areas: byArea,
    limitations:
      'Tagged as military by provider, not all military flights; broad geographic boxes overlap. No exact positions or tracks stored.',
  });
}

// Monitor source mil_lol (hourly). adsb.fi terms: personal, non-commercial use
// with a link to adsb.fi (shown on the data page).
export async function militaryFromCache(env, slot) {
  const cached = await readAdsbCache(env, 'adsb_mil', slot, 60);
  const data = cached.data;
  if (!data.provider) {
    const tried = (Array.isArray(data.attempts) ? data.attempts : [])
      .map(a => String(a?.provider) + ' ' + String(a?.result))
      .join('; ');
    throw new Error('upstream military ADS-B unavailable from GitHub collector: ' + tried.slice(0, 160));
  }
  if (!['adsb.lol', 'adsb.fi'].includes(data.provider)) throw new Error('unexpected military ADS-B provider');
  return [militarySummary(data, slot, cached.checkedAtMs)];
}
