// Tension index, part 2: D1 I/O. Each Editor tick computes the hours that are
// complete and not yet stored, oldest first, a few per tick, so the first run
// back-fills the history Monitor already keeps (observations live 90 days).
//
// CORE_DB table tension_hours(hour_ms, values_json, index_json), created on
// first use: one row per hour. values_json holds every region × indicator
// value (the history the norm is computed from); index_json is the result,
// read by /api/overview and /ops (latest row). One write per hour; the norm
// reads 14 days = 336 rows.
import { DAY, HOUR, hourIndex, hourValues } from './indicators.mjs';
import { newsTier } from '../news/tier.mjs';

export const TENSION = Object.freeze({ hoursPerTick: 12, baselineDays: 14, maxCalibrationDays: 30 });
const SOURCES = Object.freeze({
  mil_lol: 6 * HOUR,
  adsb: 6 * HOUR,
  adsb_alt: 6 * HOUR,
  gfw_sar: 8 * DAY,
  gfw_sar_baseline: 8 * DAY,
  firms: 6 * HOUR,
  copernicus_ems: null, // activation metadata: all rows (tens)
  ioda: DAY,
  gdelt_context: DAY,
  easa: 3 * DAY,
  marad_official: 3 * DAY,
  mscio: 3 * DAY,
  fcdo: 3 * DAY,
  state_dept: 3 * DAY,
});
const OFFICIAL_SQL =
  "SELECT source,min(observed_at) t FROM observations WHERE source IN ('easa','marad_official','mscio','fcdo','state_dept') GROUP BY source";

export const ensureTension = db =>
  db
    .prepare(
      'CREATE TABLE IF NOT EXISTS tension_hours(hour_ms INTEGER PRIMARY KEY,values_json TEXT NOT NULL,index_json TEXT NOT NULL)',
    )
    .run();

// → { computed, state, last_hour_ms } — hours written this tick.
export async function tensionTick(env, now = Date.now()) {
  const db = env.CORE_DB;
  if (!db || !env.NEWS_DB) return { computed: 0, state: 'no_db' };
  await ensureTension(db);
  const done = await db.prepare('SELECT max(hour_ms) h, min(hour_ms) f FROM tension_hours').first();
  const current = Math.floor(now / HOUR) * HOUR; // the hour ending now is complete
  let start;
  if (done?.h) start = done.h + HOUR;
  else {
    const first = await db.prepare('SELECT min(observed_at) t FROM observations').first();
    if (!first?.t) return { computed: 0, state: 'no_observations' };
    start = Math.ceil(first.t / HOUR) * HOUR + DAY; // the first day only fills windows
  }
  if (start > current) return { computed: 0, state: 'up_to_date', last_hour_ms: done?.h ?? null };
  const hours = [];
  for (let h = start; h <= current && hours.length < TENSION.hoursPerTick; h += HOUR) hours.push(h);
  const from = hours[0],
    to = hours[hours.length - 1];

  const names = Object.keys(SOURCES);
  const results = await db.batch([
    ...names.map(source =>
      SOURCES[source] === null
        ? db.prepare('SELECT observed_at,payload FROM observations WHERE source=?').bind(source)
        : db
            .prepare(
              'SELECT observed_at,payload FROM observations WHERE source=? AND observed_at>=? AND observed_at<?',
            )
            .bind(source, from - SOURCES[source], to),
    ),
    db.prepare(OFFICIAL_SQL),
    db
      .prepare('SELECT hour_ms,values_json FROM tension_hours WHERE hour_ms>=? AND hour_ms<?')
      .bind(from - TENSION.baselineDays * DAY, from),
  ]);
  const obs = Object.fromEntries(names.map((s, i) => [s, results[i]?.results || []]));
  const firstSeen = Object.fromEntries((results[names.length]?.results || []).map(r => [r.source, r.t]));
  // history: key → [{h, v}] of hours with data.
  const history = new Map();
  const remember = (h, values) => {
    for (const [k, x] of Object.entries(values)) {
      if (!x.has_data) continue;
      if (!history.has(k)) history.set(k, []);
      history.get(k).push({ h, v: x.value });
    }
  };
  for (const r of results[names.length + 1]?.results || []) {
    try {
      remember(r.hour_ms, JSON.parse(r.values_json));
    } catch {
      // a broken row only shortens the norm
    }
  }
  const firstHour = done?.f ?? from;
  const news =
    (
      await env.NEWS_DB.prepare(
        'SELECT headline,summary,source,url,published_ms FROM news_items WHERE published_ms>=? AND published_ms<?',
      )
        .bind(from - DAY, to)
        .all()
    ).results || [];
  const tierOf = n => newsTier(n).tier;

  const writes = [];
  for (const h of hours) {
    const values = hourValues(h, { obs, news, firstSeen }, tierOf);
    // The norm: the 14 days before this hour without the last 24 h, so an
    // escalation does not become its own norm within a day.
    const window = new Map();
    for (const [k, list] of history)
      window.set(
        k,
        list.filter(x => x.h >= h - TENSION.baselineDays * DAY && x.h < h - DAY).map(x => x.v),
      );
    const days = Math.min(TENSION.maxCalibrationDays, Math.floor((h - firstHour) / DAY));
    const index = hourIndex(h, values, window, days);
    const plain = Object.fromEntries(values);
    writes.push(
      db
        .prepare('INSERT OR REPLACE INTO tension_hours(hour_ms,values_json,index_json) VALUES(?,?,?)')
        .bind(h, JSON.stringify(plain), JSON.stringify(index)),
    );
    remember(h, plain);
  }
  await db.batch(writes);
  return { computed: hours.length, state: 'computed', last_hour_ms: to };
}
