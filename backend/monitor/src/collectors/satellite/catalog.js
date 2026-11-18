import { json } from '../../api/json.js';
import { HOUR, MINUTE } from '../../config/constants.js';
import { item } from '../../observations/item.js';
export const GEO_CATALOG_AREAS = [
  ['tehran', [50.8, 35.1, 52.0, 36.2]],
  ['strait_of_hormuz', [55.5, 25.3, 57.3, 27.4]],
  ['persian_gulf', [50.0, 25.0, 53.3, 27.7]],
  ['red_sea_south', [41.5, 12.8, 44.5, 16.5]],
];
export const GEO_DAY = 24 * HOUR;
export function catalogHttps(value, allowedHosts, pathPrefix = '/') {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && allowedHosts.includes(u.hostname) && u.pathname.startsWith(pathPrefix)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function validBbox(bbox) {
  return (
    Array.isArray(bbox) &&
    bbox.length === 4 &&
    bbox.every(Number.isFinite) &&
    bbox[0] >= -180 &&
    bbox[2] <= 180 &&
    bbox[1] >= -90 &&
    bbox[3] <= 90 &&
    bbox[0] < bbox[2] &&
    bbox[1] < bbox[3]
  );
}
export function bboxIntersects(a, b) {
  return validBbox(a) && validBbox(b) && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
// Provider-specific D1 lease/backoff: one permitted catalog lookup at a time.
export async function catalogGet(env, provider, url) {
  const db = env.DB,
    now = Date.now();
  await db.prepare('INSERT OR IGNORE INTO worker_provider_state(provider) VALUES (?)').bind(provider).run();
  const lease = now + 20000;
  const claim = await db
    .prepare(
      'UPDATE worker_provider_state SET lease_until=? WHERE provider=? AND next_allowed_at<=? AND lease_until<=? RETURNING failures',
    )
    .bind(lease, provider, now, now)
    .first();
  if (!claim) {
    const state = await db
      .prepare('SELECT next_allowed_at,lease_until,last_error FROM worker_provider_state WHERE provider=?')
      .bind(provider)
      .first();
    const until = Math.max(state?.next_allowed_at || 0, state?.lease_until || 0);
    throw new Error('upstream ' + provider + ' paused until ' + new Date(until).toISOString());
  }
  let response,
    result,
    failure = null;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
      redirect: 'manual',
    });
    if (!response.ok) throw new Error('upstream HTTP ' + response.status);
    const size = response.headers.get('Content-Length');
    if (size !== null && Number(size) > 2_000_000) throw new Error('unexpected catalog response size');
    result = await response.json();
    if (!result || typeof result !== 'object') throw new Error('unexpected catalog JSON');
  } catch (error) {
    failure = /^(upstream |unexpected )/.test(error.message) ? error.message : 'upstream unavailable';
  }
  if (failure) {
    const status = response?.status || 0;
    const failures = Math.min(8, (claim.failures || 0) + 1);
    const base = status === 429 ? 6 * HOUR : status === 401 || status === 403 ? 24 * HOUR : HOUR;
    const delay = Math.min(48 * HOUR, base * 2 ** Math.min(4, failures - 1));
    const header = response?.headers.get('Retry-After');
    const retryTime =
      header && /^\d+$/.test(header) ? now + Number(header) * 1000 : header ? Date.parse(header) : 0;
    const until = Math.max(now + delay, Number.isFinite(retryTime) ? retryTime : 0);
    await response?.body?.cancel().catch(() => {});
    await db
      .prepare(
        'UPDATE worker_provider_state SET next_allowed_at=?,lease_until=0,failures=?,last_status=?,last_error=? WHERE provider=? AND lease_until=?',
      )
      .bind(until, failures, status, failure, provider, lease)
      .run();
    throw new Error(failure + '; ' + provider + ' retry after ' + new Date(until).toISOString());
  }
  await db
    .prepare(
      'UPDATE worker_provider_state SET next_allowed_at=?,lease_until=0,failures=0,last_status=200,last_error=NULL WHERE provider=? AND lease_until=?',
    )
    .bind(Date.now() + 3000, provider, lease)
    .run();
  return result;
}
export async function sentinelCatalog(env, slot) {
  // Eight requests/day across 4 areas x 2 collections; no continuous tracking.
  const turn = Math.floor(slot / (3 * HOUR));
  const [area, bbox] = GEO_CATALOG_AREAS[Math.floor(turn / 2) % GEO_CATALOG_AREAS.length];
  const collection = turn % 2 === 0 ? 'sentinel-2-l2a' : 'sentinel-1-grd';
  const params = new URLSearchParams({
    collections: collection,
    bbox: bbox.join(','),
    datetime: new Date(slot - 21 * GEO_DAY).toISOString().slice(0, 10) + 'T00:00:00Z/..',
    limit: '8',
    sortby: '-properties.datetime',
  });
  const api = 'https://earth-search.aws.element84.com/v1/search?' + params;
  const data = await catalogGet(env, 'earth-search.aws.element84.com', api);
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > 8)
    throw new Error('unexpected Earth Search STAC response');
  const entries = [],
    seen = new Set();
  for (const feature of data.features) {
    if (
      feature?.type !== 'Feature' ||
      feature.collection !== collection ||
      typeof feature.id !== 'string' ||
      !/^[A-Za-z0-9_-]{6,160}$/.test(feature.id) ||
      seen.has(feature.id) ||
      !bboxIntersects(feature.bbox, bbox)
    )
      continue;
    const at = Date.parse(feature.properties?.datetime);
    if (!Number.isFinite(at) || at > slot + 15 * MINUTE || at < slot - 22 * GEO_DAY) continue;
    const self = (feature.links || []).find(x => x.rel === 'self')?.href;
    const canonical = catalogHttps(self, ['earth-search.aws.element84.com'], '/v1/collections/');
    if (!canonical) continue;
    const cloud = feature.properties?.['eo:cloud_cover'];
    const preview = catalogHttps(feature.assets?.thumbnail?.href, [
      'sentinel-cogs.s3.us-west-2.amazonaws.com',
      'sentinel1euwest.blob.core.windows.net',
    ]);
    seen.add(feature.id);
    entries.push(
      item('earth/' + area + '/' + feature.id, {
        title:
          (collection === 'sentinel-2-l2a' ? 'Sentinel-2 optical' : 'Sentinel-1 SAR') + ' scene — ' + area,
        area,
        collection,
        scene_id: feature.id,
        acquired_at: new Date(at).toISOString(),
        item_url: canonical,
        preview_url: preview,
        bbox: feature.bbox,
        cloud_cover_percent: Number.isFinite(cloud) && cloud >= 0 && cloud <= 100 ? cloud : null,
        platform:
          typeof feature.properties.platform === 'string' ? feature.properties.platform.slice(0, 40) : null,
        polarizations: Array.isArray(feature.properties?.['sar:polarizations'])
          ? feature.properties['sar:polarizations'].filter(x => ['VV', 'VH', 'HH', 'HV'].includes(x))
          : [],
        provider: 'Earth Search by Element 84',
        metadata_only: true,
        source_type: 'open_satellite_scene_catalog',
        caveat:
          'Discovery metadata, not an analyzed image. Tile overlap is not evidence of observed activity; no pixel comparison, object identification, or incident confirmation.',
      }),
    );
  }
  if (data.features.length && !entries.length) throw new Error('unexpected Earth Search scene metadata');
  return {
    entries,
    missing: data.links?.some(x => x.rel === 'next') ? ['catalog_first_page_only'] : [],
    detail: 'Limited STAC discovery page. No pixels downloaded; scene availability is not an event.',
  };
}
export async function aerialArchive(env, slot) {
  // Archival discovery: one request/day, rotating through four wide regions.
  const [area, bbox] = GEO_CATALOG_AREAS[Math.floor(slot / GEO_DAY) % GEO_CATALOG_AREAS.length];
  const params = new URLSearchParams({ bbox: bbox.join(','), limit: '3' });
  const api = 'https://api.openaerialmap.org/meta?' + params;
  const data = await catalogGet(env, 'api.openaerialmap.org', api);
  if (
    !data?.meta ||
    !Array.isArray(data.results) ||
    data.results.length > 3 ||
    data.meta.provided_by !== 'OpenAerialMap'
  )
    throw new Error('unexpected OpenAerialMap metadata response');
  const entries = [],
    seen = new Set();
  for (const row of data.results) {
    if (!/^[a-f\d]{24}$/i.test(row?._id || '') || seen.has(row._id) || !bboxIntersects(row.bbox, bbox))
      continue;
    const acquired = Date.parse(row.acquisition_start);
    if (!Number.isFinite(acquired) || acquired > slot + GEO_DAY) continue;
    const canonical =
      catalogHttps(row.meta_uri, ['api.openaerialmap.org'], '/meta/') ||
      'https://api.openaerialmap.org/meta/' + row._id;
    seen.add(row._id);
    entries.push(
      item('oam/' + area + '/' + row._id, {
        area,
        title: typeof row.title === 'string' ? row.title.slice(0, 180) : 'OpenAerialMap archive image',
        acquired_at: new Date(acquired).toISOString(),
        bbox: row.bbox,
        ground_sample_distance_m: Number.isFinite(row.gsd) && row.gsd > 0 ? row.gsd : null,
        provider: typeof row.provider === 'string' ? row.provider.slice(0, 150) : null,
        item_url: canonical,
        catalog_license: typeof data.meta.license === 'string' ? data.meta.license : null,
        metadata_only: true,
        archive_only: true,
        source_type: 'open_aerial_imagery_archive',
        caveat:
          'Archival crowdsourced aerial imagery. Acquisition date may be years old; no current conditions or military event inferred. Check individual image attribution/terms before republication.',
      }),
    );
  }
  if (data.results.length && !entries.length) throw new Error('unexpected OpenAerialMap imagery metadata');
  return { entries, missing: [], detail: 'Historical OpenAerialMap metadata only; coverage is patchy.' };
}

// Hourly, source-attributed machine-coded news context from free GDELT Project data.
// GitHub Actions decompresses limited Events 2.0 archives. This is NOT verified conflict reporting.
