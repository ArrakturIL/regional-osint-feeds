// Tension index (owner 21.11): read the latest hour computed by the Editor
// (backend/editor/src/tension). Fails soft: a missing table or a stale row
// gives null, so the overview and /ops never break on it.
const HOUR = 3600e3;

export async function readTension(db, now = Date.now()) {
  try {
    const row = await db
      .prepare('SELECT hour_ms,index_json FROM tension_hours ORDER BY hour_ms DESC LIMIT 1')
      .first();
    if (!row || now - row.hour_ms > 3 * HOUR) return null;
    return JSON.parse(row.index_json);
  } catch {
    return null;
  }
}

// Public shape: codes and numbers only (labels live in the UI, RU and HE).
export function publicTension(index) {
  if (!index || !Array.isArray(index.regions)) return null;
  return {
    as_of: new Date(index.hour_ms).toISOString(),
    level: index.level,
    calibrating: Boolean(index.calibrating),
    baseline_days: index.baseline_days,
    regions: index.regions.map(r => ({
      id: r.id,
      level: r.level,
      families: r.families || [],
      signals: (r.flagged || []).map(f => f.indicator),
      // «Данные» shows each signal against its norm (numbers only).
      details: (r.flagged || []).map(f => ({
        indicator: f.indicator,
        value: f.value,
        ...(f.rule !== undefined ? { rule: f.rule } : { p95: f.p95, median: f.median }),
        ...(Array.isArray(f.refs)
          ? {
              refs: f.refs.slice(0, 4).map(x => ({
                source: String(x.source),
                at: new Date(Number(x.at)).toISOString(),
                n: Math.max(1, Number(x.n) || 1),
                ...(Array.isArray(x.places)
                  ? { places: x.places.filter(v => typeof v === 'string').slice(0, 6) }
                  : {}),
              })),
            }
          : {}),
      })),
      coverage: r.coverage,
    })),
  };
}
