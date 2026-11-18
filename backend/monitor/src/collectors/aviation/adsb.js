import { AIRLIFT_TYPES, TANKER_TYPES } from './airbridge-types.js';
import { airSamplingRegions } from './regions.js';
import { MINUTE } from '../../config/constants.js';
import { providerGet } from '../../network/provider-client.js';
import { item } from '../../observations/item.js';
export async function aviation(env, slot) {
  const { focus, context } = airSamplingRegions(env);
  // Existing 15-minute budget: 48 focus and 48 context samples per day.
  // After a provider rate-limit failure, spend recovery probes on the focus area.
  const health = await env.DB.prepare('SELECT failures FROM worker_provider_state WHERE provider=?')
    .bind('adsb.lol')
    .first();
  const recovering = (health?.failures || 0) > 0;
  const turn = Math.floor(slot / (15 * MINUTE)),
    primary = recovering || turn % 2 === 0;
  const region = primary ? focus : context[Math.floor(turn / 2) % context.length];
  const sample = await aviationRegion(region, slot, env);
  sample.payload.sampled_only = true;
  sample.payload.receiver_coverage_unverified = true;
  sample.payload.sampling_priority = primary ? 'primary' : 'context';
  sample.payload.expected_same_region_interval_minutes = primary ? 30 : 30 * context.length;
  sample.payload.coverage_note =
    'Zero detected in one receiver-network snapshot does not prove empty airspace';
  return {
    entries: [sample],
    missing: ['unsampled_other_regions', 'unverified_receiver_coverage'],
    detail:
      'ADS-B ' +
      (primary ? 'priority' : 'context') +
      ' sample in ' +
      region[0] +
      '; coverage and unsampled areas remain unknown',
  };
}

export async function aviationRegion([area, lat, lon, requestedRadius], slot, env) {
  if (![lat, lon, requestedRadius].every(Number.isFinite) || requestedRadius <= 0)
    throw new Error('unexpected ADS-B region');
  const radius = Math.min(250, requestedRadius);
  const provider = 'adsb.lol';
  const url = 'https://api.adsb.lol/v2/point/' + [lat, lon, radius].join('/');
  const data = await providerGet(env, provider, url);
  const types = {},
    unique = new Set();
  let missingCallsign = 0,
    militaryFlagged = 0,
    airliftTypes = 0,
    tankerTypes = 0;
  for (const aircraft of data.ac) {
    if (!aircraft.hex || unique.has(aircraft.hex)) continue;
    unique.add(aircraft.hex);
    const type = /^[A-Z0-9]{2,5}$/.test(aircraft.t) ? aircraft.t : 'unknown';
    types[type] = (types[type] || 0) + 1;
    if (!String(aircraft.flight || '').trim()) missingCallsign++;
    if ((Number(aircraft.dbFlags) & 1) === 1) militaryFlagged++;
    if (AIRLIFT_TYPES.has(type)) airliftTypes++;
    if (TANKER_TYPES.has(type)) tankerTypes++;
  }
  return item(area + '/' + slot, {
    url,
    provider,
    area,
    radius_nm: radius,
    requested_radius_nm: requestedRadius,
    coverage_limited: radius < requestedRadius,
    snapshot_at: data.now < 1e12 ? data.now * 1000 : data.now,
    observed_aircraft: unique.size,
    types,
    missing_callsign: missingCallsign,
    military_db_flagged: militaryFlagged,
    airlift_type_observed: airliftTypes,
    tanker_type_observed: tankerTypes,
    sample_status: unique.size ? 'aircraft_observed' : 'zero_in_sample',
  });
}

// Keep 48 AvioADSB requests/day: 32 focus, 16 context; never bypass provider quotas.
