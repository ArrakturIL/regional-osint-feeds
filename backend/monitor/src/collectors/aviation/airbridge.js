import { AIRBRIDGE_REGIONS, AIRLIFT_TYPES, TANKER_TYPES } from './airbridge-types.js';
import { HOUR } from '../../config/constants.js';
import { providerGet } from '../../network/provider-client.js';
import { item } from '../../observations/item.js';
export async function airbridgeContext(env, slot) {
  const now = Date.now();
  const quota = await env.DB.prepare(
    'SELECT remaining,reset_at,checked_at FROM worker_provider_quota WHERE provider=?',
  )
    .bind('avioadsb.org')
    .first()
    .catch(() => null);
  if (quota && quota.reset_at > now && quota.remaining <= 28)
    return {
      entries: [],
      missing: ['quota_reserved_for_tehran'],
      detail: 'Air corridor snapshot skipped: reserve AvioADSB quota for Tehran',
    };
  const [area, lat, lon] = AIRBRIDGE_REGIONS[Math.floor(slot / HOUR) % AIRBRIDGE_REGIONS.length];
  const radius = 100,
    url = 'https://avioadsb.org/v1/point/' + [lat, lon, radius].join('/');
  const data = await providerGet(env, 'avioadsb.org', url);
  const seen = new Set(),
    logisticsTypes = {};
  let airlift = 0,
    tankers = 0,
    flagged = 0,
    flaggedLogistics = 0,
    noType = 0;
  for (const plane of data.ac) {
    const hex = String(plane.hex || '').toLowerCase();
    if (!/^[a-f0-9]{6}$/.test(hex) || seen.has(hex)) continue;
    seen.add(hex);
    const type = String(plane.t || '').toUpperCase();
    const isAirlift = AIRLIFT_TYPES.has(type),
      isTanker = TANKER_TYPES.has(type);
    const isFlagged = (Number(plane.dbFlags) & 1) === 1;
    if (!type) noType++;
    if (isAirlift) airlift++;
    if (isTanker) tankers++;
    if (isFlagged) flagged++;
    if (isFlagged && (isAirlift || isTanker)) flaggedLogistics++;
    if (isAirlift || isTanker) logisticsTypes[type] = (logisticsTypes[type] || 0) + 1;
  }
  return {
    entries: [
      item(area + '/' + slot, {
        provider: 'avioadsb.org',
        url,
        area,
        radius_nm: radius,
        snapshot_at: data.now < 1e12 ? data.now * 1000 : data.now,
        observed_aircraft: seen.size,
        airlift_type_observed: airlift,
        tanker_type_observed: tankers,
        military_db_flagged: flagged,
        flagged_logistics_type: flaggedLogistics,
        unknown_type: noType,
        logistics_types: logisticsTypes,
        sample_status: seen.size ? 'aircraft_observed' : 'zero_in_sample',
        evidence_grade: 'single_snapshot_only',
        receiver_coverage_unverified: true,
        attribution: 'Data: AvioADSB (CC BY-NC 4.0)',
        attribution_url: 'https://avioadsb.org',
        license: 'CC BY-NC 4.0 — noncommercial use',
        caveat:
          '100 NM snapshot cannot establish origin, destination, route, unique flights or US military affiliation. Database flags and types are imperfect hints.',
      }),
    ],
    missing: ['route_not_observable', 'receiver_coverage_unverified'],
    detail: 'Air corridor context in ' + area + '; snapshot counts are not transatlantic movements',
  };
}
