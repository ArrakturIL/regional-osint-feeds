import { sources } from './sources.js';
export async function claimManualRun(db, slot) {
  const row=await db.prepare("SELECT id,sources_json FROM worker_manual_runs WHERE status='pending' AND requested_ms<=? ORDER BY requested_ms LIMIT 1").bind(slot).first();
  if (!row) return null;
  const claim=await db.prepare("UPDATE worker_manual_runs SET status='running', started_ms=? WHERE id=? AND status='pending'").bind(slot,row.id).run();
  if (claim.meta?.changes!==1) return null;
  let wanted=[];
  try {
    const parsed=JSON.parse(row.sources_json);
    if (Array.isArray(parsed)) wanted=parsed.filter(s=>typeof s==="string"&&sources.some(x=>x.name===s));
  } catch { /* malformed manual request: recorded with no sources */ }
  return {id:row.id,wanted:[...new Set(wanted)]};
}

