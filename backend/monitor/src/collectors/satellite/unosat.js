import { json } from '../../api/json.js';
import { get } from '../../network/http.js';
import { readCollectorPair } from '../../mirrors/collector-cache.js';
import { item } from '../../observations/item.js';
export async function unosatAnalysis(env, slot) {
  const root = 'https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/';
  let doc, health;
  try {
    ({ data: doc, status: health } = await readCollectorPair(
      env,
      'unosat',
      root + 'unosat-analysis.json',
      root + 'unosat-analysis-status.json',
      { nowMs: slot, maxAgeMs: 48 * 3600000 },
    ));
  } catch {
    throw Error('UNOSAT_mirror_unavailable');
  }
  if (
    doc?.schema_version !== 1 ||
    doc.source !== 'unosat_analysis' ||
    !Array.isArray(doc.products) ||
    doc.products.length > 24 ||
    health?.source !== 'unosat_analysis' ||
    !['ok', 'partial'].includes(health.state)
  )
    throw Error('UNOSAT_invalid_mirror');
  const stamp = Date.parse(doc.checked_at),
    hstamp = Date.parse(health.checked_at);
  if (!Number.isFinite(stamp) || Math.abs(hstamp - stamp) > 600000 || stamp > slot + 3600000)
    throw Error('UNOSAT_bad_mirror_timestamp');
  if (slot - stamp > 48 * 3600000)
    return {
      entries: [],
      missing: ['collector_stale'],
      detail: 'UNOSAT metadata collection delayed >48 hours; coverage unknown',
    };
  const entries = [],
    unique = new Set();
  for (const p of doc.products) {
    if (
      !p ||
      typeof p.service_id !== 'string' ||
      p.service_id.length > 160 ||
      unique.has(p.service_id) ||
      !/^https:\/\/unosatgis\.cern\.ch\/rapidmapping\/rest\/services\/[A-Za-z0-9_/-]+\/(?:MapServer|FeatureServer)$/.test(
        p.map_service_url || '',
      ) ||
      ![
        'IRN',
        'PSE',
        'ISR',
        'SYR',
        'LBN',
        'IRQ',
        'OMN',
        'YEM',
        'SAU',
        'KWT',
        'QAT',
        'BHR',
        'JOR',
        'EGY',
        'TUR',
        'SDN',
      ].includes(p.region_code)
    )
      continue;
    unique.add(p.service_id);
    entries.push(
      item(p.service_id, {
        analysis_type: 'unosat_official_geospatial_analysis_layer',
        provider: 'UNOSAT United Nations Satellite Centre',
        event_folder: p.event_folder,
        region: p.region_code,
        event_date: p.event_date_from_folder,
        layer_title: String(p.analysis_label || 'Official analysis').slice(0, 100),
        map_service_url: p.map_service_url,
        source_url: p.map_service_url,
        publication_date: null,
        satellite_acquisition_date: null,
        collected_at: doc.checked_at,
        content_status: 'official_gis_service_exists',
        caveat:
          'Event folder date is NOT the image date or release date. Layer existence is NOT independent proof of damage.',
        attribution: 'United Nations Satellite Centre / UNOSAT',
      }),
    );
  }
  if (!entries.length)
    return {
      entries: [],
      missing: ['no_matching_service_in_sample'],
      detail: 'No public regional UNOSAT analysis layers in sampled catalogue; not proof no mapping exists',
    };
  return {
    entries,
    missing: health.state === 'partial' ? ['partial_catalogue'] : [],
    detail: health.state === 'partial' ? 'UNOSAT public catalogue partially accessible' : null,
  };
}

// Separate previous-period GFW SAR sample. Raw counts are never a coverage-adjusted trend.
