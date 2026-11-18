import { settings } from '../../config/settings.js';
import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
export async function hotspots(env, slot) {
  const area = settings(env).firms.join(',');
  const base = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/';
  const csv = await get(
    base + encodeURIComponent(env.FIRMS_KEY) + '/VIIRS_NOAA20_NRT/' + area + '/1',
    'text',
  );
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  const cols = header.split(',');
  if (!cols.includes('latitude') || !cols.includes('acq_date')) throw new Error('unexpected FIRMS response');
  const groups = {};
  for (const row of rows) {
    const cells = row.split(',');
    const lat = Number(cells[cols.indexOf('latitude')]);
    const lon = Number(cells[cols.indexOf('longitude')]);
    const date = cells[cols.indexOf('acq_date')];
    if (!date || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const grid = date + '/' + Math.floor(lat) + '/' + Math.floor(lon);
    groups[grid] = (groups[grid] || 0) + 1;
  }

  // Keep the legacy 1-degree summary, but also retain smaller gridded, time-aware
  // thermal observations. FRP is thermal radiative power, not evidence of an attack.
  const columns = name => cols.indexOf(name);
  const tiny = new Map();
  for (const row of rows.slice(0, 18000)) {
    const c = row.split(',');
    const lat = Number(c[columns('latitude')]),
      lon = Number(c[columns('longitude')]);
    const date = c[columns('acq_date')],
      time = c[columns('acq_time')] || '';
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const cell = [date, (Math.floor(lat * 10) / 10).toFixed(1), (Math.floor(lon * 10) / 10).toFixed(1)].join(
      '/',
    );
    let d = tiny.get(cell);
    if (!d) {
      d = {
        day: date,
        lat: Number((Math.floor(lat * 10) / 10).toFixed(1)),
        lon: Number((Math.floor(lon * 10) / 10).toFixed(1)),
        hotspot_count: 0,
        frp_sum_mw: 0,
        night_count: 0,
        first_utc: null,
        last_utc: null,
      };
      tiny.set(cell, d);
    }
    d.hotspot_count++;
    const frp = Number(c[columns('frp')]);
    if (Number.isFinite(frp) && frp >= 0 && frp < 5000) d.frp_sum_mw += frp;
    if (c[columns('daynight')] === 'N') d.night_count++;
    const moment =
      date +
      'T' +
      String(time).padStart(4, '0').slice(0, 2) +
      ':' +
      String(time).padStart(4, '0').slice(2, 4) +
      ':00Z';
    if (!d.first_utc || moment < d.first_utc) d.first_utc = moment;
    if (!d.last_utc || moment > d.last_utc) d.last_utc = moment;
  }
  const clusters = [...tiny.values()]
    .map(x => ({ ...x, frp_sum_mw: Math.round(x.frp_sum_mw * 10) / 10 }))
    .sort((a, b) => b.hotspot_count - a.hotspot_count)
    .slice(0, 50);

  return [
    item(slot, {
      url: 'https://firms.modaps.eosdis.nasa.gov/map/',
      area,
      satellite: 'VIIRS_NOAA20_NRT',
      counts_by_day_and_degree: groups,
      analysis_type: 'firms_viirs_thermal_clusters',
      grid_resolution_degrees: 0.1,
      detected_pixels: rows.length,
      clusters_0_1deg: clusters,
      caveat:
        'Hot pixels include fires, industrial heat and satellite artifacts. They do not verify attacks or explosions.',
      data_time_utc: 'per cluster',
      attribution: 'NASA FIRMS',
    }),
  ];
}
