import { json } from './json.js';
import { aviation } from '../collectors/aviation/adsb.js';
import { vessels } from '../collectors/maritime/ais.js';
import { hotspots } from '../collectors/satellite/firms.js';
import { EASA } from '../config/constants.js';
import { sources } from '../schedule/sources.js';
export const SATELLITE_PUBLIC_ORIGIN = '*'; // Whitelisted public metrics only; no credentials accepted.
export const SATELLITE_PUBLIC_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': SATELLITE_PUBLIC_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'public, max-age=60, s-maxage=180',
};
export function satellitePublicResponse(payload, status = 200, head = false) {
  const out = JSON.stringify(payload);
  return new Response(head ? null : out, { status, headers: SATELLITE_PUBLIC_HEADERS });
}
export function satelliteDay(x) {
  if (typeof x !== 'string') return null;
  const hit = x.match(/^\d{4}-\d{2}-\d{2}/);
  return hit ? hit[0] : null;
}
export function satellitePublicMetric(n) {
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? n : null;
}
export async function publicSatelliteApi(env, request) {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: SATELLITE_PUBLIC_HEADERS });
  if (method !== 'GET' && method !== 'HEAD')
    return satellitePublicResponse({ error: 'method_not_allowed' }, 405);
  const [rows, state] = await env.DB.batch([
    env.DB.prepare(
      "SELECT source,artifact_id,analysis_type,region,observed_from,observed_to,source_url,interpretation,collected_at_ms,payload FROM satellite_analysis WHERE source IN ('firms','gfw_sar','gfw_sar_baseline','copernicus_ems','unosat_analysis') ORDER BY collected_at_ms DESC LIMIT 160",
    ),
    env.DB.prepare(
      "SELECT source,state,attempted_at,succeeded_at,detail FROM source_status WHERE source IN ('firms','gfw_sar','copernicus_ems','unosat_analysis')",
    ),
  ]);
  const asOf = Date.now();
  const sourceNames = {
    firms: 'NASA FIRMS',
    gfw_sar: 'Global Fishing Watch SAR',
    copernicus_ems: 'Copernicus EMS',
    unosat_analysis: 'UNOSAT',
  };
  const cadenceHours = { firms: 1, gfw_sar: 24, copernicus_ems: 6, unosat_analysis: 12 };
  const sources = (state.results || []).map(x => ({
    id: x.source,
    name: sourceNames[x.source] || x.source,
    state:
      x.state === 'ok'
        ? 'ok'
        : x.state === 'empty'
          ? 'empty'
          : x.state === 'partial'
            ? 'partial'
            : 'unavailable',
    checked_at: x.attempted_at ? new Date(x.attempted_at).toISOString() : null,
    last_success_at: x.succeeded_at ? new Date(x.succeeded_at).toISOString() : null,
    cadence_hours: cadenceHours[x.source] || null,
    note:
      x.source === 'copernicus_ems'
        ? 'Product catalogue is sampled and currently has partial provider coverage.'
        : x.source === 'unosat_analysis'
          ? 'GIS layer metadata may be historical; presence is not verified damage.'
          : x.source === 'firms'
            ? 'Thermal hotspots include industrial sources, fires and false detections.'
            : 'SAR detections may be delayed and are not unique vessels or evidence of transponder switching.',
  }));
  const byName = new Map(sources.map(x => [x.id, x]));
  for (const id of Object.keys(sourceNames)) {
    if (!byName.has(id))
      sources.push({
        id,
        name: sourceNames[id],
        state: 'pending',
        checked_at: null,
        last_success_at: null,
        cadence_hours: cadenceHours[id],
        note: 'No completed observation yet',
      });
  }
  const parsed = [];
  for (const row of rows.results || []) {
    try {
      const data = JSON.parse(row.payload);
      if (data && typeof data === 'object') parsed.push({ row, data });
    } catch {}
  }
  const unique = new Map();
  for (const { row, data } of parsed) {
    const key = row.source + ':' + row.artifact_id;
    if (!unique.has(key)) unique.set(key, { row, data });
  }
  const all = [...unique.values()];
  const newest = name => all.find(x => x.row.source === name);
  // Publisher rule: do not turn unnormalized SAR counts, zero FIRMS samples or
  // unverified thermal pixels into user-facing incidents. Raw readings stay in D1.
  // A separate evidence/corroboration pipeline must promote a defensible claim.
  const signals = [];
  const pubNow = Date.now();
  const fresh = (value, maxAgeDays) => {
    const date = Date.parse(value || '');
    return Number.isFinite(date) && date <= pubNow + 3600000 && date >= pubNow - maxAgeDays * 86400000;
  };
  const reports = all
    .filter(
      x =>
        x.row.source === 'unosat_analysis' &&
        x.data.analysis_type === 'unosat_official_geospatial_analysis_layer' &&
        fresh(x.data.publication_date, 30) &&
        fresh(x.data.event_date, 90),
    )
    .slice(0, 24);
  const publishedProducts = all
    .filter(
      x =>
        x.row.source === 'copernicus_ems' &&
        x.data.analysis_type === 'copernicus_ems_published_product_metadata' &&
        Number.isInteger(x.data.product_count) &&
        x.data.product_count > 0 &&
        fresh(x.data.activation_at, 90) &&
        fresh(x.data.last_update, 30),
    )
    .slice(0, 30);
  const references = [
    ...publishedProducts.map(({ row, data: d }) => ({
      id: 'copernicus:' + String(d.activation_id || row.artifact_id).slice(0, 120),
      source: 'Copernicus EMS',
      title: String(d.title || 'Официальный картографический продукт').slice(0, 220),
      region: Array.isArray(d.countries) ? d.countries.join(', ').slice(0, 130) : '',
      event_date: satelliteDay(d.activation_at),
      publication_date: satelliteDay(d.last_update),
      url:
        typeof d.source_url === 'string' &&
        d.source_url.startsWith('https://mapping.emergency.copernicus.eu/')
          ? d.source_url
          : null,
      analysis_type: 'official_activation_metadata',
      is_historical: true,
      caveat: 'Наличие активации не подтверждает определённый ущерб.',
    })),
    ...reports.map(({ row, data: d }) => ({
      id: 'unosat:' + String(row.artifact_id).slice(0, 150),
      source: 'UNOSAT',
      title: String(d.layer_title || 'Официальный GIS-слой').slice(0, 140),
      region: String(d.region || '').slice(0, 20),
      event_date: satelliteDay(d.event_date?.replace?.(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')),
      publication_date: null,
      url:
        typeof d.map_service_url === 'string' &&
        d.map_service_url.startsWith('https://unosatgis.cern.ch/rapidmapping/rest/services/')
          ? d.map_service_url
          : null,
      analysis_type: 'official_gis_catalogue_entry',
      is_historical: true,
      caveat: 'Дата относится к событию. Она не является датой съёмки и не подтверждает повреждения.',
    })),
  ];
  const mostRecent = Math.max(0, ...(state.results || []).map(x => x.succeeded_at || 0));
  return satellitePublicResponse(
    {
      schema_version: 1,
      generated_at: new Date(asOf).toISOString(),
      status: sources.every(x => x.state === 'ok') ? 'ok' : 'partial',
      live_incident_confirmation: false,
      latest_success_at: mostRecent ? new Date(mostRecent).toISOString() : null,
      sources: sources.sort(
        (a, b) => Object.keys(sourceNames).indexOf(a.id) - Object.keys(sourceNames).indexOf(b.id),
      ),
      signals,
      reference_products: references.slice(0, 40),
      has_publishable_content: signals.length > 0 || references.length > 0,
      display_policy: signals.length || references.length ? 'show' : 'hide',
      data_status:
        signals.length || references.length
          ? 'current_supported_material'
          : 'insufficient_publishable_evidence',
      publication_policy:
        'No raw radar counts, one-off aircraft samples, zero thermal reports or historical mapping catalogues are presented as current events.',
      interpretation:
        'Сведения являются спутниковыми измерениями и каталогами опубликованной аналитики, а не независимым подтверждением боевых действий.',
      attribution: 'NASA FIRMS; Global Fishing Watch; Copernicus EMS; UNOSAT',
    },
    200,
    method === 'HEAD',
  );
}

// Public aviation safety notices: publish official recent EASA advisories only.
// Never turn a single ADS-B/AvioADSB receiver snapshot into an airspace conclusion.
