// B10: one translation job queue for RU and HE, every kind of text.
//
// Before B10 each path kept its own bookkeeping: RU skipped an item for the
// rest of the UTC day after one bad answer (news_ru_attempts), HE allowed one
// retry per day (regional_i18n_attempts), and anything not translated within
// the 36 h selection window silently dropped out. Now every item that needs a
// translation is a job with a state:
//   pending → done           an accepted translation (or no longer needed);
//   pending → pending        a rejected answer: attempts+1, retry after a
//                            per-tier back-off; a transient failure (provider
//                            down, pool spent, broken JSON) only defers it;
//   pending → manual         after MAX_ATTEMPTS rejections, or older than
//                            MAX_AGE_MS: visible on /ops for a human or GPT,
//                            never dropped silently.
// Jobs are served urgent > important > normal, newest first within a tier.
// Normal jobs stop before the shared free pools run out (RESERVE), so urgent
// and important news always find Workers AI neurons and Gemini calls.
import { AI_POOL_NEURONS } from '../ai/budget.mjs';

export const MAX_ATTEMPTS = 3;
export const MAX_AGE_MS = 72 * 3600000;
const MIN = 60000;
// Back-off after the n-th rejection (index n-1), by tier.
export const BACKOFF_MIN = Object.freeze({ urgent: [5, 15], important: [15, 30], normal: [30, 120] });
export const DEFER_MIN = Object.freeze({ urgent: 5, important: 5, normal: 15 });
// Kept free for urgent/important: 1 500 of the 8 500-neuron Workers AI pool and
// 60 of the 450 daily Gemini Flash-Lite calls (router GEMINI_LITE.dailyCap).
export const RESERVE = Object.freeze({ neurons: 1500, geminiCalls: 60, geminiCap: 450 });
const TIER_ORDER = "CASE tier WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END";

const ready = new WeakMap();
export function ensureJobs(db) {
  if (!ready.has(db))
    ready.set(
      db,
      db
        .batch([
          db.prepare(
            'CREATE TABLE IF NOT EXISTS translation_jobs(kind TEXT NOT NULL,item_id TEXT NOT NULL,' +
              "language TEXT NOT NULL CHECK(language IN ('ru','he')),source_hash TEXT NOT NULL," +
              "tier TEXT NOT NULL DEFAULT 'normal',state TEXT NOT NULL DEFAULT 'pending'," +
              'attempts INTEGER NOT NULL DEFAULT 0,next_at_ms INTEGER NOT NULL,last_reason TEXT,last_model TEXT,' +
              'payload_json TEXT,discovered_ms INTEGER,created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,' +
              'PRIMARY KEY(kind,item_id,language))',
          ),
          db.prepare(
            'CREATE INDEX IF NOT EXISTS translation_jobs_due ON translation_jobs(language,state,next_at_ms)',
          ),
        ])
        .catch(e => {
          ready.delete(db);
          throw e;
        }),
    );
  return ready.get(db);
}

// A changed source text (new hash) or `redo` (an accepted translation no
// longer passes the checks) restarts the job; otherwise only the tier and
// payload follow the source. Unchanged jobs are not written at all.
const UPSERT =
  'INSERT INTO translation_jobs(kind,item_id,language,source_hash,tier,state,attempts,next_at_ms,payload_json,discovered_ms,created_ms,updated_ms) ' +
  "VALUES(?1,?2,?3,?4,?5,'pending',0,?6,?7,?8,?6,?6) ON CONFLICT(kind,item_id,language) DO UPDATE SET " +
  'tier=excluded.tier,payload_json=excluded.payload_json,discovered_ms=excluded.discovered_ms,updated_ms=excluded.updated_ms,' +
  "state=CASE WHEN translation_jobs.source_hash<>excluded.source_hash OR (?9=1 AND translation_jobs.state='done') THEN 'pending' ELSE translation_jobs.state END," +
  "attempts=CASE WHEN translation_jobs.source_hash<>excluded.source_hash OR (?9=1 AND translation_jobs.state='done') THEN 0 ELSE translation_jobs.attempts END," +
  "next_at_ms=CASE WHEN translation_jobs.source_hash<>excluded.source_hash OR (?9=1 AND translation_jobs.state='done') THEN excluded.next_at_ms ELSE translation_jobs.next_at_ms END," +
  'created_ms=CASE WHEN translation_jobs.source_hash<>excluded.source_hash THEN excluded.created_ms ELSE translation_jobs.created_ms END,' +
  'source_hash=excluded.source_hash ' +
  'WHERE translation_jobs.source_hash<>excluded.source_hash OR translation_jobs.tier<>excluded.tier ' +
  "OR (?9=1 AND translation_jobs.state='done')";

export async function enqueueJobs(db, jobs, now) {
  if (!jobs.length) return 0;
  await ensureJobs(db);
  const out = await db.batch(
    jobs.map(j =>
      db
        .prepare(UPSERT)
        .bind(
          j.kind,
          String(j.id),
          j.language,
          j.sourceHash,
          j.tier || 'normal',
          now,
          j.payload === undefined ? null : JSON.stringify(j.payload),
          Number.isSafeInteger(j.discoveredMs) ? j.discoveredMs : null,
          j.redo ? 1 : 0,
        ),
    ),
  );
  return out.reduce((n, r) => n + (r?.meta?.changes || 0), 0);
}

// Pending jobs older than MAX_AGE_MS go to the manual queue (visible), then the
// due jobs in serving order. allowNormal=false serves urgent/important only.
export async function dueJobs(db, language, now, limit, { allowNormal = true, kinds = null } = {}) {
  await ensureJobs(db);
  await db
    .prepare(
      "UPDATE translation_jobs SET state='manual',last_reason='expired_72h',updated_ms=? " +
        "WHERE language=? AND state='pending' AND created_ms<?",
    )
    .bind(now, language, now - MAX_AGE_MS)
    .run();
  const kindFilter = kinds ? ' AND kind IN (' + kinds.map(() => '?').join(',') + ')' : '';
  const rows =
    (
      await db
        .prepare(
          'SELECT kind,item_id,language,source_hash,tier,attempts,payload_json,discovered_ms FROM translation_jobs ' +
            "WHERE language=? AND state='pending' AND next_at_ms<=?" +
            (allowNormal ? '' : " AND tier<>'normal'") +
            kindFilter +
            ' ORDER BY ' +
            TIER_ORDER +
            ',discovered_ms DESC,item_id LIMIT ?',
        )
        .bind(language, now, ...(kinds || []), limit)
        .all()
    ).results || [];
  return rows.map(r => {
    let payload = null;
    try {
      payload = r.payload_json ? JSON.parse(r.payload_json) : null;
    } catch {
      payload = null;
    }
    return {
      kind: r.kind,
      id: r.item_id,
      language: r.language,
      sourceHash: r.source_hash,
      tier: r.tier,
      attempts: r.attempts,
      discoveredMs: r.discovered_ms,
      payload,
    };
  });
}

export function backoffMs(tier, attempts) {
  const steps = BACKOFF_MIN[tier] || BACKOFF_MIN.normal;
  return steps[Math.min(steps.length, Math.max(1, attempts)) - 1] * MIN;
}

// outcome: 'done' | 'rejected' | 'deferred'. Guarded by source_hash so a job
// restarted by a newer source text is not overwritten by an older answer.
export async function settleJob(db, job, outcome, { reason = null, model = null } = {}, now = Date.now()) {
  const key = [job.kind, String(job.id), job.language, job.sourceHash];
  let sql, args;
  if (outcome === 'done') {
    sql =
      "UPDATE translation_jobs SET state='done',last_reason=?,last_model=COALESCE(?,last_model),updated_ms=? " +
      'WHERE kind=? AND item_id=? AND language=? AND source_hash=?';
    args = [reason, model, now, ...key];
  } else if (outcome === 'rejected') {
    const attempts = (job.attempts || 0) + 1;
    const manual = attempts >= MAX_ATTEMPTS;
    sql =
      'UPDATE translation_jobs SET attempts=?,state=?,next_at_ms=?,last_reason=?,last_model=COALESCE(?,last_model),updated_ms=? ' +
      'WHERE kind=? AND item_id=? AND language=? AND source_hash=?';
    args = [
      attempts,
      manual ? 'manual' : 'pending',
      now + backoffMs(job.tier, attempts),
      String(reason || 'rejected').slice(0, 120),
      model,
      now,
      ...key,
    ];
  } else {
    sql =
      'UPDATE translation_jobs SET next_at_ms=?,last_reason=?,updated_ms=? ' +
      'WHERE kind=? AND item_id=? AND language=? AND source_hash=?';
    args = [
      now + (DEFER_MIN[job.tier] || DEFER_MIN.normal) * MIN,
      String(reason || 'deferred').slice(0, 120),
      now,
      ...key,
    ];
  }
  await db
    .prepare(sql)
    .bind(...args)
    .run();
}

// Normal jobs run only while both free pools keep their reserve. Fails open.
export async function normalAllowed(db, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  try {
    const [pool, gemini] = await db.batch([
      db.prepare('SELECT neurons FROM ai_daily_neurons WHERE day_utc=?').bind(day),
      db
        .prepare('SELECT calls FROM ai_provider_calls WHERE day_utc=? AND provider_model=?')
        .bind(day, 'gemini:flash-lite'),
    ]);
    const neurons = Number(pool?.results?.[0]?.neurons) || 0,
      calls = Number(gemini?.results?.[0]?.calls) || 0;
    return neurons < AI_POOL_NEURONS - RESERVE.neurons && calls < RESERVE.geminiCap - RESERVE.geminiCalls;
  } catch {
    return true;
  }
}

// /ops: counts by language/state/tier and the oldest pending job per language.
export async function queueSummary(db, now = Date.now()) {
  await ensureJobs(db);
  const rows =
    (
      await db
        .prepare(
          "SELECT language,state,tier,count(*) n,min(CASE WHEN state='pending' THEN created_ms END) oldest " +
            "FROM translation_jobs WHERE state<>'done' OR updated_ms>? GROUP BY language,state,tier",
        )
        .bind(now - 86400000)
        .all()
    ).results || [];
  const out = {};
  for (const r of rows) {
    const lang = (out[r.language] ||= { pending: {}, manual: {}, done_24h: {}, oldest_pending_ms: null });
    const bucket = r.state === 'done' ? 'done_24h' : r.state;
    if (lang[bucket]) lang[bucket][r.tier] = r.n;
    if (r.oldest && (!lang.oldest_pending_ms || r.oldest < lang.oldest_pending_ms))
      lang.oldest_pending_ms = r.oldest;
  }
  return out;
}
