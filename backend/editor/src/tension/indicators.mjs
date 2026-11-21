// Tension index, part 1: hourly indicators from what Monitor already stores
// (owner 21.11). Pure functions, no D1: rows in, numbers out.
//
// Every indicator belongs to one family (air, sea, ground, cyber, news,
// official). The index counts families, not indicators, so two views of the
// same thing (two ADS-B feeds) never add up to "independent confirmation".
//
// Deliberately absent, from live data 21.11:
//   - civil-traffic drop over Iran: ADS-B receivers see ~0 aircraft there;
//   - AIS: the 7-second aisstream sample averages 0.09 vessels;
//   - Sentinel / aerial catalogues: retired, availability is not an event.
// Regions are coarse boxes on purpose; FIRMS cells are 1° and map approximately.

export const HOUR = 3600e3;
export const DAY = 24 * HOUR;
export const REGIONS = Object.freeze(['iran', 'levant', 'gulf', 'red_sea', 'iraq']);
export const FAMILIES = Object.freeze(['air', 'sea', 'ground', 'cyber', 'news', 'official']);

// mil_lol area names → regions (syria_iraq counts for both).
const MIL_AREAS = {
  iran: ['western_iran', 'central_eastern_iran'],
  levant: ['israel_jordan', 'eastern_mediterranean', 'syria_iraq'],
  gulf: ['persian_gulf', 'gulf_of_oman'],
  red_sea: ['red_sea'],
  iraq: ['syria_iraq'],
};
// adsb / adsb_alt point samples → regions.
const ADSB_AREAS = {
  iran: ['tehran', 'western_iran', 'northern_iran', 'eastern_iran'],
  gulf: ['persian_gulf', 'gulf_of_oman', 'hormuz'],
};
// ICAO type designators of tankers and strategic/tactical airlift.
const TANKER_AIRLIFT = new Set([
  'K35R',
  'K35E',
  'KC46',
  'KC10',
  'KC2',
  'A332',
  'A400',
  'C17',
  'C5M',
  'C130',
  'C30J',
  'IL76',
]);
// GDELT / FIPS country codes → regions.
const GDELT_COUNTRIES = {
  iran: ['IR'],
  levant: ['IS', 'LE', 'SY', 'JO', 'GZ', 'WE'],
  gulf: ['SA', 'AE', 'QA', 'BA', 'KU', 'MU'],
  red_sea: ['YM'],
  iraq: ['IZ'],
};
// Free text (official titles, news headlines; EN/RU/HE) → regions.
const TEXT_REGIONS = {
  iran: /iran|tehran|irgc|иран|тегеран|ксир|איראן|טהרן/iu,
  levant:
    /israel|lebanon|syria|gaza|jordan|hezbollah|hamas|west bank|израил|ливан|сири|газ[аеуы]|иордан|хезболл|хамас|ישראל|לבנון|סוריה|עזה|ירדן|חיזבאללה|חמאס/iu,
  gulf: /persian gulf|arabian gulf|hormuz|gulf of oman|bahrain|qatar|emirates|\buae\b|kuwait|\boman\b|saudi|персидск|ормуз|оманск|бахрейн|катар|эмират|оаэ|кувейт|саудов|המפרץ|הורמוז|בחריין|קטאר|האמירויות|כווית|סעודי/iu,
  red_sea:
    /red sea|bab el|bab-el|gulf of aden|yemen|houthi|красн\p{L}*\s+мор|йемен|хусит|ים סוף|תימן|חות['׳]?י/iu,
  iraq: /iraq|baghdad|ирак|багдад|עיראק|בגדד/iu,
};
export const textRegions = text => REGIONS.filter(r => TEXT_REGIONS[r].test(String(text || '')));

// FIRMS 1° cell (integer lat/lon of the lower-left corner) → region, inside
// the collector box 44–64°E, 24–40°N. Approximate borders.
export function firmsRegion(lat, lon) {
  if (lon <= 46 && lat >= 29 && lat <= 36) return 'iraq';
  if (lon === 47 && lat >= 29 && lat <= 30) return 'iraq';
  if (lat <= 28 && lon >= 47 && lon <= 50) return 'gulf';
  if (lat <= 25 && lon >= 51 && lon <= 56) return 'gulf';
  if (lat >= 25 && lon >= 44 && lon <= 63) return 'iran';
  return null;
}

const json = s => {
  try {
    const x = JSON.parse(s || '{}');
    return x && typeof x === 'object' ? x : {};
  } catch {
    return {};
  }
};
const within = (rows, from, to) => rows.filter(r => r.observed_at >= from && r.observed_at < to);

// Indicator definitions. `rule` indicators are events (flag when value ≥ rule);
// the rest are compared with their own 14-day norm (p95), with an absolute floor.
export const INDICATORS = Object.freeze([
  { id: 'mil_aircraft', family: 'air', regions: Object.keys(MIL_AREAS), floor: 3 },
  { id: 'mil_tanker_airlift', family: 'air', regions: Object.keys(MIL_AREAS), floor: 2 },
  { id: 'adsb_military', family: 'air', regions: Object.keys(ADSB_AREAS), floor: 2 },
  { id: 'sar_dark_vessels', family: 'sea', regions: ['gulf'], rule: 1.3 },
  { id: 'firms_hotspots', family: 'ground', regions: ['iran', 'gulf', 'iraq'], floor: 15 },
  { id: 'copernicus_activation', family: 'ground', regions: REGIONS, rule: 1 },
  { id: 'internet_outage', family: 'cyber', regions: ['iran', 'levant', 'gulf', 'red_sea', 'iraq'], rule: 1 },
  { id: 'urgent_news', family: 'news', regions: REGIONS, floor: 3 },
  { id: 'gdelt_conflict', family: 'news', regions: REGIONS, floor: 10 },
  { id: 'official_notice', family: 'official', regions: REGIONS, rule: 1 },
]);

const IODA_COUNTRY = {
  IR: 'iran',
  IL: 'levant',
  LB: 'levant',
  SY: 'levant',
  JO: 'levant',
  PS: 'levant',
  IQ: 'iraq',
  YE: 'red_sea',
  SA: 'gulf',
  AE: 'gulf',
  QA: 'gulf',
  BH: 'gulf',
  KW: 'gulf',
  OM: 'gulf',
};
const OFFICIAL = new Set(['easa', 'marad_official', 'mscio', 'fcdo', 'state_dept']);

/**
 * Values for the hour ending at `h` (exclusive), per region and indicator.
 * `data`: { obs: {source: rows[]}, news: rows[], firstSeen: {source: ms} }.
 * → Map key `${region}:${indicator}` → { value, has_data }.
 */
export function hourValues(h, data, tierOf) {
  const out = new Map();
  const put = (region, id, value, hasData, refs) =>
    out.set(region + ':' + id, { value, has_data: hasData ? 1 : 0, ...(refs?.length ? { refs } : {}) });
  const obs = s => data.obs[s] || [];

  // Air: military-tagged aircraft (mil_lol), last 6 h.
  const mil = within(obs('mil_lol'), h - 6 * HOUR, h).map(r => json(r.payload));
  for (const [region, areas] of Object.entries(MIL_AREAS)) {
    const ids = new Set();
    let heavy = 0;
    for (const p of mil)
      for (const a of areas) {
        const area = p.areas?.[a];
        if (!area) continue;
        for (const id of area.aircraft_ids || []) ids.add(id);
        heavy = Math.max(
          heavy,
          Object.entries(area.types || {}).reduce((n, [t, c]) => n + (TANKER_AIRLIFT.has(t) ? c : 0), 0),
        );
      }
    put(region, 'mil_aircraft', ids.size, mil.length > 0);
    put(region, 'mil_tanker_airlift', heavy, mil.length > 0);
  }
  // Air: database-flagged military in point samples (adsb, adsb_alt), last 6 h.
  const pts = [...obs('adsb'), ...obs('adsb_alt')].filter(
    r => r.observed_at >= h - 6 * HOUR && r.observed_at < h,
  );
  for (const [region, areas] of Object.entries(ADSB_AREAS)) {
    const mine = pts.map(r => json(r.payload)).filter(p => areas.includes(p.area));
    put(
      region,
      'adsb_military',
      Math.max(0, ...mine.map(p => Number(p.military_db_flagged) || 0)),
      mine.length > 0,
    );
  }
  // Sea: SAR detections without AIS vs the previous week (GFW computes both).
  const latest = s =>
    obs(s)
      .filter(r => r.observed_at < h)
      .sort((a, b) => b.observed_at - a.observed_at)[0];
  const sar = latest('gfw_sar'),
    base = latest('gfw_sar_baseline');
  const now = Number(json(sar?.payload).unmatched_ais_detections),
    before = Number(json(base?.payload).unmatched_ais_detections);
  const fresh = sar && h - sar.observed_at < 3 * DAY;
  put(
    'gulf',
    'sar_dark_vessels',
    fresh && before > 0 ? +(now / before).toFixed(3) : 0,
    Boolean(fresh && before > 0),
  );
  // Ground: FIRMS hotspots on the hour's UTC day and the day before.
  const firms = latest('firms');
  const counts = json(firms?.payload).counts_by_day_and_degree || {};
  const days = new Set([
    new Date(h - 1).toISOString().slice(0, 10),
    new Date(h - 1 - DAY).toISOString().slice(0, 10),
  ]);
  const fire = { iran: 0, gulf: 0, iraq: 0 };
  for (const [key, n] of Object.entries(counts)) {
    const [day, lat, lon] = key.split('/');
    const region = days.has(day) ? firmsRegion(Number(lat), Number(lon)) : null;
    if (region) fire[region] += Number(n) || 0;
  }
  const firmsFresh = firms && h - firms.observed_at < 6 * HOUR;
  for (const region of Object.keys(fire)) put(region, 'firms_hotspots', fire[region], Boolean(firmsFresh));
  // Ground: a Copernicus EMS activation that started in the last 72 h.
  const cems = obs('copernicus_ems').map(r => json(r.payload));
  for (const region of REGIONS) {
    const n = new Set(
      cems
        .filter(p => {
          const at = Date.parse(
            (p.activation_at || '') + (/(Z|[+-]\d\d:?\d\d)$/.test(p.activation_at || '') ? '' : 'Z'),
          );
          return (
            at >= h - 3 * DAY &&
            at < h &&
            textRegions((p.countries || []).join(' ') + ' ' + (p.title || '')).includes(region)
          );
        })
        .map(p => p.activation_id),
    ).size;
    put(region, 'copernicus_activation', n, cems.length > 0);
  }
  // Cyber: an IODA outage that started in the last 24 h (IODA rows exist only for outages).
  const outages = obs('ioda').map(r => json(r.payload));
  for (const region of REGIONS) {
    const sev = outages
      .filter(p => IODA_COUNTRY[p.area] === region && p.start * 1000 >= h - DAY && p.start * 1000 < h)
      .reduce((m, p) => Math.max(m, Number(p.severity) || 0), 0);
    put(region, 'internet_outage', sev > 0 ? 1 : 0, true);
  }
  // News: urgent and important items of the last 24 h, by region keywords.
  const news = (data.news || []).filter(n => n.published_ms >= h - DAY && n.published_ms < h);
  for (const region of REGIONS) {
    const n = news.filter(x => {
      const t = tierOf(x);
      return (t === 'urgent' || t === 'important') && textRegions(x.headline).includes(region);
    }).length;
    put(region, 'urgent_news', n, true);
  }
  // News: GDELT machine-coded conflict events of the last 24 h.
  const gdelt = within(obs('gdelt_context'), h - DAY, h).map(r => json(r.payload));
  for (const [region, codes] of Object.entries(GDELT_COUNTRIES)) {
    const n = gdelt.reduce(
      (s, p) => s + codes.reduce((a, c) => a + (Number(p.by_action_country?.[c]) || 0), 0),
      0,
    );
    put(region, 'gdelt_conflict', n, gdelt.length > 0);
  }
  // Official: a new advisory or a new revision in the last 72 h. The first
  // import of each source (its first hour) is history, not news.
  const notices = Object.entries(data.obs)
    .filter(([s]) => OFFICIAL.has(s))
    .flatMap(([s, rows]) =>
      within(rows, h - 3 * DAY, h)
        .filter(r => r.observed_at > (data.firstSeen?.[s] || 0) + HOUR)
        .map(r => {
          const p = json(r.payload);
          const text = [
            p.title,
            p.area,
            p.country,
            s === 'mscio' ? 'gulf of aden red sea persian gulf' : '',
          ].join(' ');
          return { text, source: s, at: r.observed_at };
        }),
    );
  // Owner 22.11: say whose notice it is. refs: the latest notice per source
  // (code and time only; the UI names the body in RU/HE).
  for (const region of REGIONS) {
    const hit = notices.filter(n => textRegions(n.text).includes(region));
    const latest = new Map();
    for (const n of hit) if (!(latest.get(n.source)?.at >= n.at)) latest.set(n.source, n);
    const refs = [...latest.values()].sort((a, b) => b.at - a.at).map(n => ({ source: n.source, at: n.at }));
    put(region, 'official_notice', hit.length, true, refs);
  }
  return out;
}

// p-th percentile of a numeric list (nearest rank).
export const percentile = (values, p) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null;
};

// Minimum history before a norm-based indicator may flag (3 days of hours).
export const MIN_BASELINE_HOURS = 72;

/**
 * Flags and the 1–5 level for one hour.
 * `values`: Map from hourValues; `history`: Map key → number[] (earlier hours).
 */
export function hourIndex(h, values, history, baselineDays) {
  const regions = [];
  for (const region of REGIONS) {
    const defs = INDICATORS.filter(d => d.regions.includes(region));
    const flagged = [];
    let seen = 0;
    for (const d of defs) {
      const v = values.get(region + ':' + d.id);
      if (!v?.has_data) continue;
      seen++;
      if (d.rule !== undefined) {
        if (v.value >= d.rule)
          flagged.push({
            indicator: d.id,
            family: d.family,
            value: v.value,
            rule: d.rule,
            ...(v.refs ? { refs: v.refs } : {}),
          });
        continue;
      }
      const past = history.get(region + ':' + d.id) || [];
      if (past.length < MIN_BASELINE_HOURS) continue;
      const p95 = percentile(past, 0.95),
        median = percentile(past, 0.5);
      if (v.value > p95 && v.value >= d.floor && v.value >= median * 1.5)
        flagged.push({ indicator: d.id, family: d.family, value: v.value, p95, median });
    }
    const families = [...new Set(flagged.map(f => f.family))];
    const n = families.length;
    const level = n === 0 ? 1 : n === 1 ? 2 : n === 2 ? 3 : n >= 4 || families.includes('official') ? 5 : 4;
    regions.push({ id: region, level, families, flagged, coverage: { seen, total: defs.length } });
  }
  return {
    hour_ms: h,
    baseline_days: baselineDays,
    calibrating: baselineDays < 30,
    level: Math.max(...regions.map(r => r.level)),
    regions,
  };
}
