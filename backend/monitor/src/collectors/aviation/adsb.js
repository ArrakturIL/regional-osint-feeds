import { AIRLIFT_TYPES, TANKER_TYPES } from './airbridge-types.js';
import { airSamplingRegions } from './regions.js';
import { MINUTE } from '../../config/constants.js';
import { readD1CollectorSnapshot } from '../../mirrors/collector-cache.js';
import { item } from '../../observations/item.js';

// Q12 (19.11): ADS-B providers refuse Cloudflare Worker egress (adsb.lol 429
// since 18.11; /mil and adsb.fi 403) but answer GitHub runners. The
// adsb.yml / adsb-mil.yml workflows collect there, publish to Neon and sync the
// private D1 row; the Monitor reads only that row and never calls the provider.
//
// A snapshot is accepted once: it must have been collected after this
// source's previous Monitor slot, so a missed collector run shows as missing
// data instead of the same aircraft being stored as a second sample.
export async function readAdsbCache(env, sourceKey, slot, everyMinutes) {
  let cached;
  try {
    cached = await readD1CollectorSnapshot(env, sourceKey);
  } catch (error) {
    throw new Error(
      'upstream ADS-B GitHub collector cache unreadable: ' + String(error?.message).slice(0, 80),
    );
  }
  if (!cached) throw new Error('upstream ADS-B GitHub collector cache missing (' + sourceKey + ')');
  const since = slot - everyMinutes * MINUTE;
  if (cached.checkedAtMs <= since || cached.checkedAtMs > slot + 20 * MINUTE) {
    throw new Error(
      'upstream ADS-B GitHub collector: no new snapshot since ' +
        new Date(since).toISOString() +
        ' (last ' +
        new Date(cached.checkedAtMs).toISOString() +
        ')',
    );
  }
  if (cached.data?.source !== sourceKey || cached.status?.source !== sourceKey)
    throw new Error('unexpected ADS-B cache structure');
  return cached;
}

export async function aviation(env, slot) {
  const { focus, context } = airSamplingRegions(env);
  // Same 15-minute budget as before: focus and context samples alternate.
  const turn = Math.floor(slot / (15 * MINUTE)),
    primary = turn % 2 === 0;
  const region = primary ? focus : context[Math.floor(turn / 2) % context.length];
  const cached = await readAdsbCache(env, 'adsb', slot, 15);
  const sample = aviationRegion(region, slot, cached);
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

export function aviationRegion([area, lat, lon, requestedRadius], slot, cached) {
  if (![lat, lon, requestedRadius].every(Number.isFinite) || requestedRadius <= 0)
    throw new Error('unexpected ADS-B region');
  const regions = Array.isArray(cached.data.regions) ? cached.data.regions : [];
  const sampled = regions.find(
    r =>
      r?.area === area &&
      Math.abs(r.lat - lat) < 1e-9 &&
      Math.abs(r.lon - lon) < 1e-9 &&
      r.requested_radius_nm === requestedRadius,
  );
  if (!sampled) throw new Error('unexpected ADS-B cache: region ' + area + ' not collected');
  const provider = String(cached.data.provider || 'adsb.lol');
  if (sampled.error)
    throw new Error('upstream ' + provider + ' ' + String(sampled.error).slice(0, 60) + ' (' + area + ')');
  if (!Array.isArray(sampled.ac) || !Number.isFinite(sampled.now_ms) || !(sampled.radius_nm > 0))
    throw new Error('unexpected ADS-B cache structure');
  const types = {},
    unique = new Set();
  let missingCallsign = 0,
    militaryFlagged = 0,
    airliftTypes = 0,
    tankerTypes = 0;
  for (const aircraft of sampled.ac) {
    if (!aircraft?.hex || unique.has(aircraft.hex)) continue;
    unique.add(aircraft.hex);
    const type = /^[A-Z0-9]{2,5}$/.test(aircraft.t) ? aircraft.t : 'unknown';
    types[type] = (types[type] || 0) + 1;
    if (!String(aircraft.flight || '').trim()) missingCallsign++;
    if ((Number(aircraft.dbFlags) & 1) === 1) militaryFlagged++;
    if (AIRLIFT_TYPES.has(type)) airliftTypes++;
    if (TANKER_TYPES.has(type)) tankerTypes++;
  }
  return item(area + '/' + slot, {
    url: sampled.url,
    provider,
    collected_via: 'github_actions',
    collected_at: cached.checkedAtMs,
    area,
    radius_nm: sampled.radius_nm,
    requested_radius_nm: requestedRadius,
    coverage_limited: sampled.radius_nm < requestedRadius,
    snapshot_at: sampled.now_ms,
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
