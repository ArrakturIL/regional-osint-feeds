import { AIRLIFT_TYPES, TANKER_TYPES } from './airbridge-types.js';
import { airSamplingRegions } from './regions.js';
import { MINUTE } from '../../config/constants.js';
import { providerGet } from '../../network/provider-client.js';
import { item } from '../../observations/item.js';
export async function aviationAlternative(env, slot) {
  const { focus, context } = airSamplingRegions(env);
  const turn = Math.floor(slot / (30 * MINUTE)),
    primary = turn % 3 !== 2;
  const quota = await env.DB.prepare(
    'SELECT remaining,reset_at,checked_at FROM worker_provider_quota WHERE provider=?',
  )
    .bind('avioadsb.org')
    .first()
    .catch(() => null);
  if (quota && quota.reset_at > Date.now()) {
    // Shared-network quota is not ours alone: preserve the remaining requests for Tehran.
    const skip =
      quota.remaining === 0 ||
      (quota.remaining <= 4
        ? turn % 6 !== 0
        : quota.remaining <= 12
          ? turn % 3 !== 0
          : quota.remaining <= 28 && !primary);
    if (skip)
      return {
        entries: [],
        missing: ['quota_reserved_for_tehran'],
        detail:
          'AvioADSB sample skipped under shared-network quota pressure; ' +
          quota.remaining +
          ' requests remain until ' +
          new Date(quota.reset_at).toISOString(),
      };
  }
  const [area, lat, lon, requestedRadius] = primary ? focus : context[Math.floor(turn / 3) % context.length];
  if (![lat, lon, requestedRadius].every(Number.isFinite) || requestedRadius <= 0) {
    throw new Error('invalid alternate ADS-B regional coordinates');
  }
  const radius = Math.min(100, requestedRadius);
  const url = 'https://avioadsb.org/v1/point/' + [lat, lon, radius].join('/');
  const data = await providerGet(env, 'avioadsb.org', url);
  const unique = new Set(),
    types = {};
  let missingCallsign = 0,
    militaryFlagged = 0,
    airliftTypes = 0,
    tankerTypes = 0;
  for (const plane of data.ac) {
    const hex = String(plane.hex || '').toLowerCase();
    if (!/^[a-f0-9]{6}$/.test(hex) || unique.has(hex)) continue;
    unique.add(hex);
    const type = /^[A-Z0-9]{2,5}$/.test(plane.t || '') ? plane.t : 'unknown';
    types[type] = (types[type] || 0) + 1;
    if (!String(plane.flight || '').trim()) missingCallsign++;
    if ((Number(plane.dbFlags) & 1) === 1) militaryFlagged++;
    if (AIRLIFT_TYPES.has(type)) airliftTypes++;
    if (TANKER_TYPES.has(type)) tankerTypes++;
  }
  return {
    entries: [
      item(area + '/' + slot, {
        provider: 'avioadsb.org',
        url,
        area,
        radius_nm: radius,
        requested_radius_nm: requestedRadius,
        coverage_limited: radius < requestedRadius,
        sampled_only: true,
        receiver_coverage_unverified: true,
        sampling_priority: primary ? 'primary' : 'context',
        sample_interval_minutes: 30,
        expected_same_region_interval_minutes: primary ? 60 : 90 * context.length,
        snapshot_at: data.now < 1e12 ? data.now * 1000 : data.now,
        observed_aircraft: unique.size,
        types,
        missing_callsign: missingCallsign,
        military_db_flagged: militaryFlagged,
        airlift_type_observed: airliftTypes,
        tanker_type_observed: tankerTypes,
        sample_status: unique.size ? 'aircraft_observed' : 'zero_in_sample',
        attribution: 'Data: AvioADSB (CC BY-NC 4.0)',
        attribution_url: 'https://avioadsb.org',
        license: 'CC BY-NC 4.0 — noncommercial use',
        caveat:
          'Zero means none reported in this receiver-network sample, not empty airspace. Other regions and receiver completeness unknown.',
      }),
    ],
    missing: ['unsampled_other_regions', 'unverified_receiver_coverage'],
    detail:
      'AvioADSB ' +
      (primary ? 'priority' : 'context') +
      ' sample in ' +
      area +
      ' (<=100 NM); receiver coverage unverified',
  };
}

// 24 low-frequency context snapshots/day; Tehran's existing priority budget is unchanged.
// One <=100 NM receiver snapshot cannot establish a transatlantic flight or origin/destination.
