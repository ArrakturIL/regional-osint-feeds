// Service page for the owner (/ops): what runs, what is stuck, what came
// back, how much of each free quota is spent. Read-only, behind a login.
// The login is checked here, on the server, so it is not in the public JS.
// Credentials: OPS_USER / OPS_PASSWORD Pages secrets; until the owner sets
// them the owner asked for admin / admin.
const LIMITS = Object.freeze({
  aiPool: 8500, // ai_daily_neurons: shared Workers AI pool (B1), Free plan 10 000
  gemini: 450, // ai_provider_calls gemini:flash-lite per day (B2)
  ruNeurons: 6000, // news_translation_budget.estimated_neurons (RU titles)
  ruBatches: 288,
  heAttempts: 300, // regional_i18n_budget.attempts
  heNeurons: 6000,
  idfBatches: 24, // official_translation_budget.batches
});

function authorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let pair = '';
  try {
    pair = atob(header.slice(6));
  } catch {
    return false;
  }
  const i = pair.indexOf(':');
  const user = pair.slice(0, i),
    pass = pair.slice(i + 1);
  return i > 0 && user === (env.OPS_USER || 'admin') && pass === (env.OPS_PASSWORD || 'admin');
}

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' },
  });

async function rows(db, sql, ...args) {
  if (!db) return [];
  try {
    return (
      (
        await db
          .prepare(sql)
          .bind(...args)
          .all()
      ).results || []
    );
  } catch {
    return [];
  }
}
async function one(db, sql, ...args) {
  return (await rows(db, sql, ...args))[0] || null;
}
const parse = text => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export async function opsFromD1(request, env, now = Date.now()) {
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  const core = env.DB,
    news = env.NEWS_DB,
    day = new Date(now).toISOString().slice(0, 10),
    dayAgo = now - 86400000;
  const [
    pool,
    providers,
    ru,
    he,
    idf,
    sla,
    ruError,
    heErrors,
    ruRejected,
    ruPending,
    sources,
    collectors,
    analystRun,
    controls,
    lastRun,
    lastEvent,
    lastNote,
    gptToday,
    eval6,
  ] = await Promise.all([
    one(news, 'SELECT neurons,calls,updated_ms FROM ai_daily_neurons WHERE day_utc=?', day),
    rows(news, 'SELECT provider_model,calls,updated_ms FROM ai_provider_calls WHERE day_utc=?', day),
    one(
      news,
      'SELECT batches,estimated_neurons,updated_ms FROM news_translation_budget WHERE day_utc=?',
      day,
    ),
    one(
      news,
      'SELECT attempts,estimated_neurons,updated_at_ms FROM regional_i18n_budget WHERE day_utc=?',
      day,
    ),
    one(
      news,
      'SELECT batches,estimated_neurons,updated_ms FROM official_translation_budget WHERE day_utc=?',
      day,
    ),
    one(news, "SELECT value,updated_ms FROM editor_state WHERE key='translation_sla'"),
    one(news, "SELECT value,updated_ms FROM editor_state WHERE key='last_translation_error'"),
    rows(
      news,
      'SELECT error,count(*) n FROM regional_i18n_attempts WHERE day_utc=? AND error IS NOT NULL GROUP BY error ORDER BY n DESC LIMIT 8',
      day,
    ),
    // B10: one job queue for RU and HE (translations/jobs.mjs in Editor).
    rows(
      news,
      "SELECT language,state,tier,count(*) n,min(created_ms) oldest_ms FROM translation_jobs WHERE state<>'done' GROUP BY language,state,tier",
    ),
    one(
      news,
      'SELECT count(*) n FROM news_items WHERE discovered_ms>? AND priority>=7 AND headline_ru IS NULL',
      dayAgo,
    ),
    rows(core, 'SELECT source,attempted_at,succeeded_at,state,detail FROM source_status ORDER BY source'),
    rows(
      core,
      'SELECT source_key,checked_at_ms,synced_at_ms FROM regional_collector_cache ORDER BY source_key',
    ),
    one(
      core,
      'SELECT started_at_ms,completed_at_ms,status,stats_json,error_message FROM analyst_runs ORDER BY started_at_ms DESC LIMIT 1',
    ),
    rows(news, 'SELECT source,disabled,reason,until_ms,updated_ms FROM source_controls WHERE disabled=1'),
    one(core, 'SELECT outcome,recorded_at_ms FROM monitor_runs ORDER BY recorded_at_ms DESC LIMIT 1'),
    one(core, 'SELECT event_id,updated_at_ms FROM monitor_events ORDER BY updated_at_ms DESC LIMIT 1'),
    one(news, 'SELECT id,created_ms FROM editorial_notes ORDER BY created_ms DESC LIMIT 1'),
    rows(
      news,
      "SELECT model,count(*) n FROM regional_i18n WHERE created_at_ms>? AND model LIKE 'gpt%' GROUP BY model",
      dayAgo,
    ),
    one(news, "SELECT value,updated_ms FROM editor_state WHERE key='ai_eval_request'"),
  ]);
  const analyst = analystRun ? { ...analystRun, stats: parse(analystRun.stats_json) } : null;
  if (analyst) delete analyst.stats_json;
  return json({
    generated_at_ms: now,
    day_utc: day,
    limits: LIMITS,
    quotas: { pool, providers, ru, he, idf },
    translations: {
      sla: sla ? { ...parse(sla.value), updated_ms: sla.updated_ms } : null,
      ru_last_error: ruError,
      queue: ruRejected,
      ru_missing_24h_priority7: ruPending?.n ?? null,
      he_errors_today: heErrors,
      gpt_translations_24h: gptToday,
    },
    sources,
    collectors,
    analysts: analyst,
    paused_feeds: controls,
    gpt: { last_monitor_run: lastRun, last_dossier: lastEvent, last_editorial_note: lastNote },
    b6: eval6 ? { ...parse(eval6.value), updated_ms: eval6.updated_ms } : null,
  });
}
