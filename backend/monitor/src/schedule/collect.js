import { AIS, EASA, MSCIO } from '../config/constants.js';
import { statusSql } from '../storage/sql.js';
export async function collect(db, env, source, slot) {
  let result;
  try {
    result = await source.read(env, slot);
  } catch (error) {
    const detail = /^(upstream |unexpected |EASA |MSCIO |AIS |GFW_|CEMS_|UNOSAT_)/.test(error.message) ? error.message : "invalid upstream data";
    await db.prepare(statusSql).bind(source.name, slot, null, "error", detail).run();
    return;
  }
  const { entries, missing = [], detail = null } = Array.isArray(result) ? { entries: result } : result;
  const records = entries.map(({ id, payload }) => ({ id, payload: JSON.stringify(payload) }));
  const state = missing.length ? "partial" : records.length ? "ok" : "empty";
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO observations
      SELECT ?, json_extract(value,'$.id'), json_extract(value,'$.payload'), ?, json_extract(value,'$.payload')
      FROM json_each(?)`).bind(source.name, slot, JSON.stringify(records)),
    db.prepare(statusSql).bind(source.name, slot, missing.includes("quota_reserved_for_tehran") ? null : slot, state,
      missing.length ? detail || "Missing regions: " + missing.join(", ") : null),
  ]);
  if(['firms','gfw_sar','gfw_sar_baseline','copernicus_ems','unosat_analysis'].includes(source.name)){
    for(const e of entries.slice(0,35)){
      const v=e.payload||{};
      const type=String(v.analysis_type||'satellite_context');
      const region=String(v.region||v.countries?.join(', ')||v.area||'Regional coverage');
      const start=String(v.observation_start||v.activation_at||'').slice(0,60);
      const end=String(v.observation_end||v.last_update||'').slice(0,60);
      const url=String(v.source_url||v.url||'').slice(0,600);
      const caution=String(v.uncertainty||v.limitation||v.caveat||'Provisional satellite context; not an incident confirmation').slice(0,700);
      await db.prepare('INSERT OR REPLACE INTO satellite_analysis (source,artifact_id,analysis_type,region,observed_from,observed_to,source_url,interpretation,collected_at_ms,payload) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .bind(source.name,String(e.id).slice(0,180),type,region.slice(0,160),start,end,url,caution,slot,JSON.stringify(v)).run();
    }
  }
}


