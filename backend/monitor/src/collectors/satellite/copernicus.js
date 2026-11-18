import { json } from '../../api/json.js';
import { get } from '../../network/http.js';
import { readCollectorPair } from '../../mirrors/collector-cache.js';
import { item } from '../../observations/item.js';
export async function copernicusAnalysis(env, slot) {
  const base = 'https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/';
  let snapshot, status;
  try {
    ({ data: snapshot, status } = await readCollectorPair(
      env,
      'copernicus',
      base + 'copernicus-analyses.json',
      base + 'copernicus-analyses-status.json',
      { nowMs: slot, maxAgeMs: 36 * 3600000 },
    ));
  } catch {
    throw Error('CEMS_public_mirror_unavailable');
  }
  if (
    snapshot?.schema_version !== 1 ||
    snapshot?.source !== 'copernicus_ems' ||
    !Array.isArray(snapshot.products) ||
    snapshot.products.length > 30 ||
    status?.source !== 'copernicus_ems' ||
    !['ok', 'partial'].includes(status.state)
  )
    throw Error('CEMS_invalid_public_mirror');
  const checked = Date.parse(snapshot.checked_at),
    statusCheck = Date.parse(status.checked_at);
  if (!Number.isFinite(checked) || Math.abs(statusCheck - checked) > 600000 || checked > slot + 3600000)
    throw Error('CEMS_invalid_mirror_time');
  if (slot - checked > 36 * 3600000)
    return {
      entries: [],
      missing: ['collector_stale'],
      detail: 'CEMS GitHub mirror older than 36 hours; product coverage unknown',
    };
  const entries = [],
    seen = new Set();
  for (const p of snapshot.products) {
    if (
      !/^EMS[RN]\d{3,5}$/.test(p?.code) ||
      seen.has(p.code) ||
      typeof p.title !== 'string' ||
      p.title.length > 260 ||
      !Array.isArray(p.countries) ||
      p.countries.length > 12
    )
      continue;
    seen.add(p.code);
    entries.push(
      item(p.code, {
        analysis_type: 'copernicus_ems_published_product_metadata',
        provider: 'Copernicus Emergency Management Service',
        activation_id: p.code,
        title: p.title,
        countries: p.countries,
        category: p.category,
        phase: p.phase,
        activation_at: p.activation_at,
        last_update: p.last_update,
        product_count: p.product_count,
        aoi_count: p.aoi_count,
        closed: !!p.closed,
        source_url: p.source_url,
        report_url: p.report_url || null,
        confidence: 'official_public_activation_metadata',
        limitation:
          'An activation or listed mapping product does not by itself confirm physical damage or a military event.',
        collected_at: snapshot.checked_at,
      }),
    );
  }
  if (!entries.length)
    entries.push(
      item('catalog-scan-' + snapshot.checked_at.slice(0, 10), {
        analysis_type: 'copernicus_catalog_coverage',
        provider: 'Copernicus Emergency Management Service',
        checked_at: snapshot.checked_at,
        matching_products: 0,
        source_url: 'https://mapping.emergency.copernicus.eu/activations/api/activations/',
        caveat:
          'No matching activations in sampled API pages is NOT evidence of no incidents or no satellite products.',
      }),
    );
  return {
    entries,
    missing: status.state === 'partial' ? ['partial_provider_coverage'] : [],
    detail:
      status.state === 'partial'
        ? 'Copernicus API coverage partial; products reflect only sampled pages'
        : null,
  };
}

// Public UNOSAT ArcGIS analysis layers mirrored by GitHub collector.
