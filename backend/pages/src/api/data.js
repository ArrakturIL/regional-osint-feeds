// Pages /api/data from D1 observations. Market sentiment is not verified evidence.
import { ISO, assembleSources } from './sources.js';
const json = s => {
  try {
    const x = typeof s === 'string' ? JSON.parse(s) : s;
    return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  } catch {
    return {};
  }
};
const str = x => (typeof x === 'string' ? x.trim() : '');
const numeric = x => (Number.isFinite(Number(x)) ? Number(x) : 0);
const yesPrice = x => {
  // Gamma outcome order is not the YES/NO order; null is not zero.
  const outcomes = Array.isArray(x?.outcomes) ? x.outcomes : [];
  const prices = Array.isArray(x?.outcome_prices) ? x.outcome_prices : [];
  const matches = outcomes.flatMap((o, i) =>
    String(o ?? '')
      .trim()
      .toLowerCase() === 'yes'
      ? [i]
      : [],
  );
  if (matches.length !== 1) return null;
  const raw = prices[matches[0]];
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const price = Number(raw);
  return Number.isFinite(price) && price >= 0 && price <= 1 ? price : null;
};
const validHttps = x => {
  try {
    const u = new URL(String(x || ''));
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
};
function marketSnapshots(rows, nowMs) {
  const groups = new Map();
  for (const row of rows) {
    const p = json(row.payload),
      id = str(p.market_id);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ at: Number(row.observed_at) || 0, payload: p });
  }
  const markets = [];
  for (const [id, items] of groups) {
    items.sort((a, b) => b.at - a.at);
    const latest = items[0],
      previous = items[1] || null,
      p = latest.payload,
      yes = yesPrice(p),
      end = Date.parse(p.ends_at || '');
    if (
      yes === null ||
      p.closed === true ||
      p.active === false ||
      !Number.isFinite(end) ||
      end <= nowMs ||
      !str(p.question)
    )
      continue;
    const url = validHttps(p.url);
    if (!url || !url.startsWith('https://polymarket.com/event/')) continue;
    const prior = previous && yesPrice(previous.payload);
    const changePoints = typeof prior === 'number' ? (yes - prior) * 100 : null;
    markets.push({
      id,
      question: p.question,
      yes,
      volume: numeric(p.volume_24h),
      liquidity: numeric(p.liquidity),
      url,
      asOf: ISO(latest.at),
      end: p.ends_at,
      changePoints,
      comparisonFrom: changePoints === null ? null : ISO(previous.at),
      price_kind: 'yes_token_price',
      independent_probability: false,
      market_status: 'active',
      caveat:
        'Цена YES-токена отражает сделки и правила рынка, а не независимо подтверждённую вероятность события.',
    });
  }
  return markets.sort((a, b) => b.volume - a.volume || a.id.localeCompare(b.id));
}
function officialGroups(rows) {
  const by = { idf_official: [], marad_official: [], centcom_dvids: [] };
  const seen = { idf_official: new Set(), marad_official: new Set(), centcom_dvids: new Set() };
  for (const row of rows) {
    if (!Object.hasOwn(by, row.source)) continue;
    const raw = json(row.payload),
      url = validHttps(raw.url),
      source = row.source;
    if (!url || seen[source].has(url) || by[source].length >= 3) continue;
    seen[source].add(url);
    const maritime = source === 'marad_official',
      military = source === 'idf_official';
    const item = {
      title: str(raw.title),
      id: maritime ? str(raw.advisory_id) : '',
      active: maritime && raw.status === 'active',
      description: military ? str(raw.excerpt) : str(raw.caveat),
      url,
      published: str(raw.published_at) || null,
      observed: ISO(row.observed_at),
    };
    if (item.title) by[source].push(item);
  }
  by.marad_official.sort((a, b) => b.id.localeCompare(a.id));
  by.centcom_dvids.sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0));
  return { home: by.idf_official, marad: by.marad_official, centcom: by.centcom_dvids };
}
function satelliteItems(rows) {
  const seen = new Set(),
    out = [];
  for (const row of rows) {
    const p = json(row.payload),
      id = str(p.scene_id);
    if (!id || seen.has(id)) continue;
    const url = validHttps(p.item_url);
    if (!url) continue;
    seen.add(id);
    out.push({ id, area: str(p.area), acquiredAt: str(p.acquired_at) || null, cloudCover: null, url });
    if (out.length >= 10) break;
  }
  return out;
}
export function assembleData({
  marketRows = [],
  officialRows = [],
  sceneRows = [],
  statusRows = [],
  nowMs = Date.now(),
} = {}) {
  const official = officialGroups(officialRows);
  return {
    generatedAt: ISO(nowMs),
    markets: marketSnapshots(marketRows, nowMs),
    home: official.home,
    airbridge: null,
    aviationSamples: [],
    providerLimits: [],
    satelliteScenes: satelliteItems(sceneRows),
    marad: official.marad,
    centcom: official.centcom,
    alt: null,
    sources: assembleSources(statusRows),
  };
}
export async function dataFromD1(env, nowMs = Date.now()) {
  const db = env.DB;
  if (!db?.batch) throw new Error('Missing CORE DB binding');
  const marketSql =
    "WITH ranked AS (SELECT observed_at,payload,ROW_NUMBER() OVER(PARTITION BY json_extract(payload,'$.market_id') ORDER BY observed_at DESC) n FROM observations WHERE source='polymarket') SELECT observed_at,payload FROM ranked WHERE n<=2";
  const officialSql =
    "WITH latest AS (SELECT source,observed_at,payload,ROW_NUMBER() OVER(PARTITION BY source,json_extract(payload,'$.url') ORDER BY observed_at DESC) ver FROM observations WHERE source IN ('idf_official','marad_official','centcom_dvids')), unique_rows AS (SELECT source,observed_at,payload,ROW_NUMBER() OVER(PARTITION BY source ORDER BY observed_at DESC) n FROM latest WHERE ver=1) SELECT source,observed_at,payload FROM unique_rows WHERE n<=3 ORDER BY source,observed_at DESC";
  const scenesSql =
    "WITH ranked AS (SELECT observed_at,payload,ROW_NUMBER() OVER(PARTITION BY json_extract(payload,'$.scene_id') ORDER BY observed_at DESC) n FROM observations WHERE source='sentinel_catalog') SELECT observed_at,payload FROM ranked WHERE n=1 ORDER BY observed_at DESC,json_extract(payload,'$.acquired_at') DESC LIMIT 10";
  const [markets, official, scenes, status] = await db.batch([
    db.prepare(marketSql),
    db.prepare(officialSql),
    db.prepare(scenesSql),
    db.prepare('SELECT source,attempted_at,succeeded_at,state,detail FROM source_status ORDER BY source'),
  ]);
  return assembleData({
    marketRows: markets.results || [],
    officialRows: official.results || [],
    sceneRows: scenes.results || [],
    statusRows: status.results || [],
    nowMs,
  });
}
