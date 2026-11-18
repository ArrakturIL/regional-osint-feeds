// Only observed timestamps from known monitor-run payload shapes are valid
// comparison snapshots; free-form status labels are not timestamps.
const SOURCE_CURSOR_FIELDS = [
  'source_maxima_ms',
  'latest_observed_at_ms',
  'source_max_ms',
  'source_max_observed_at_ms',
  'last_observed_by_source_ms',
];
const snapshotMaxima = payload => {
  for (const key of SOURCE_CURSOR_FIELDS) {
    const v = payload?.[key];
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) return v;
  }
  return {};
};
const hasSnapshot = run => {
  try {
    return Object.keys(snapshotMaxima(JSON.parse(run?.payload || '{}'))).length > 0;
  } catch {
    return false;
  }
};

export function buildDigest(rows, eventRows) {
  if (!Array.isArray(rows) || rows.length < 2)
    return {
      status: 'pending',
      changes: [],
      lastCheck: rows?.[0]?.started_at_ms ? new Date(rows[0].started_at_ms).toISOString() : null,
      previousCheck: null,
      periodMinutes: null,
      sourceUpdates: 0,
      sourceComparable: 0,
    };
  const [latest, prior] = rows,
    latestMs = Number(latest.started_at_ms),
    prevMs = Number(prior.started_at_ms);
  if (!Number.isFinite(latestMs) || !Number.isFinite(prevMs) || latestMs <= prevMs)
    return { status: 'error', changes: [], error: 'invalid_monitor_run_times' };
  const parse = s => {
    try {
      return JSON.parse(s || '{}');
    } catch {
      return {};
    }
  };
  const a = parse(latest.payload),
    b = parse(prior.payload);
  // Only strictly positive integer timestamps describe comparable observations.
  // null/empty cannot silently become epoch zero via Number(null).
  const oldS = snapshotMaxima(b),
    newS = snapshotMaxima(a);
  const validMs = v =>
    (typeof v === 'number' || typeof v === 'string') &&
    String(v).trim() !== '' &&
    Number.isSafeInteger(Number(v)) &&
    Number(v) > 0;
  const keys = [...new Set([...Object.keys(oldS), ...Object.keys(newS)])].sort();
  const common = keys.filter(k => validMs(newS[k]) && validMs(oldS[k]));
  const sourceChanges = common
    .filter(k => Number(newS[k]) > Number(oldS[k]))
    .map(k => ({
      source: k,
      from_ms: Number(oldS[k]),
      to_ms: Number(newS[k]),
      kind: 'source_timestamp_advanced',
    }));
  const sourceGaps = keys
    .filter(k => !common.includes(k))
    .map(k => ({
      source: k,
      reason: !Object.hasOwn(newS, k)
        ? 'missing_latest_snapshot'
        : !Object.hasOwn(oldS, k)
          ? 'missing_previous_snapshot'
          : !validMs(newS[k])
            ? 'invalid_latest_timestamp'
            : 'invalid_previous_timestamp',
    }));
  const sourceUpdates = sourceChanges.length;
  const sourceCoverage = !keys.length
    ? { state: 'unavailable', reason: 'no_source_snapshots', comparable: 0, uncomparable: 0 }
    : !common.length
      ? {
          state: 'unavailable',
          reason: 'no_comparable_source_timestamps',
          comparable: 0,
          uncomparable: sourceGaps.length,
        }
      : sourceGaps.length
        ? {
            state: 'partial',
            reason: 'invalid_or_missing_source_timestamps',
            comparable: common.length,
            uncomparable: sourceGaps.length,
          }
        : { state: 'comparable', reason: null, comparable: common.length, uncomparable: 0 };
  const changedEvents = (Array.isArray(eventRows) ? eventRows : []).filter(
    x => Number(x.updated_at_ms) > prevMs && Number(x.updated_at_ms) <= latestMs,
  );
  const changes = changedEvents.slice(0, 6).map(x => ({
    id: 'monitor-event-' + x.event_id,
    story_id: x.event_id,
    kind: 'journal_updated',
    title: 'Обновлено досье мониторинга',
    title_he: 'עודכן תיק מעקב',
    description: 'Поступило обновление записи; само по себе это не подтверждает утверждения источников.',
    description_he: 'עודכנה רשומת המעקב; העדכון עצמו אינו מאמת טענות של מקורות.',
    time: new Date(Number(x.updated_at_ms)).toISOString(),
  }));
  if (latest.outcome !== prior.outcome)
    changes.unshift({
      id: 'monitor-state-' + latest.run_id,
      kind: 'assessment_changed',
      title: 'Изменилось решение мониторинга',
      title_he: 'השתנתה הערכת המעקב',
      description: 'Текущий статус: ' + String(latest.outcome).slice(0, 50),
      description_he: 'מצב הבדיקה: ' + String(latest.outcome).slice(0, 50),
      time: new Date(latestMs).toISOString(),
    });
  return {
    status: common.length || changes.length ? 'ready' : 'insufficient_comparison',
    changes,
    lastCheck: new Date(latestMs).toISOString(),
    previousCheck: new Date(prevMs).toISOString(),
    periodMinutes: Math.round((latestMs - prevMs) / 60000),
    sourceUpdates,
    sourceComparable: common.length,
    sourceChanges,
    sourceGaps,
    sourceCoverage,
    independentPrimarySources: null,
    outcome: latest.outcome,
    previousOutcome: prior.outcome,
  };
}

export async function readMonitorChanges(request, env) {
  const url = new URL(request.url);
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: { ...headers, 'Access-Control-Allow-Methods': 'GET,OPTIONS' },
    });
  if (request.method !== 'GET')
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
  const lang = url.searchParams.get('lang') || 'ru';
  if (lang !== 'ru' && lang !== 'he')
    return Response.json({ error: 'unsupported_language' }, { status: 400, headers });
  try {
    // Keep the latest two runs for editorial outcome/journal comparison, but
    // search a bounded recent window for two real source snapshots. Hourly
    // monitor runs sometimes omit the source map entirely.
    const result = await env.CORE_DB.prepare(
      'SELECT run_id,started_at_ms,outcome,payload FROM monitor_runs ORDER BY started_at_ms DESC LIMIT 12',
    ).all();
    const allRuns = result.results || [];
    const runs = allRuns.slice(0, 2);
    const prev = Number(runs[1]?.started_at_ms || 0),
      last = Number(runs[0]?.started_at_ms || 0);
    let events = [];
    if (prev > 0 && last > prev) {
      const v = await env.CORE_DB.prepare(
        'SELECT event_id,updated_at_ms FROM monitor_events WHERE updated_at_ms > ? AND updated_at_ms <= ? ORDER BY updated_at_ms DESC LIMIT 6',
      )
        .bind(prev, last)
        .all();
      events = v.results || [];
    }
    const digest = buildDigest(runs, events);
    const sourceRuns = allRuns.filter(hasSnapshot).slice(0, 2);
    let skippedSnapshotRuns = 0,
      sourceComparisonFrom = null,
      sourceComparisonTo = null;
    if (sourceRuns.length === 2) {
      const sourceDigest = buildDigest(sourceRuns, []);
      if (sourceDigest.sourceCoverage) {
        // Source clocks come from the nearest two usable observations, NOT from
        // the latest editorial assessment (which may omit the source map).
        for (const key of [
          'sourceUpdates',
          'sourceComparable',
          'sourceChanges',
          'sourceGaps',
          'sourceCoverage',
          'independentPrimarySources',
        ])
          digest[key] = sourceDigest[key];
        sourceComparisonFrom = sourceDigest.previousCheck;
        sourceComparisonTo = sourceDigest.lastCheck;
        const lastIndex = allRuns.indexOf(sourceRuns[1]);
        skippedSnapshotRuns = allRuns.slice(0, lastIndex + 1).filter(r => !hasSnapshot(r)).length;
        if (skippedSnapshotRuns && digest.sourceCoverage.state === 'comparable')
          digest.sourceCoverage = {
            ...digest.sourceCoverage,
            state: 'partial',
            reason: 'recent_runs_without_source_snapshots',
          };
        if (digest.status === 'insufficient_comparison' && (digest.sourceComparable || digest.changes.length))
          digest.status = 'ready';
      }
    }
    const newestMs = Number(allRuns[0]?.started_at_ms || 0);
    const newestRunAt =
      Number.isSafeInteger(newestMs) && newestMs > 0 ? new Date(newestMs).toISOString() : null;
    return Response.json(
      {
        requested_language: lang,
        generatedAt: new Date().toISOString(),
        ...digest,
        newestRunAt,
        skippedSnapshotRuns,
        sourceComparisonFrom,
        sourceComparisonTo,
      },
      { status: 200, headers },
    );
  } catch (e) {
    return Response.json(
      { error: 'digest_unavailable', message: 'monitor_comparison_not_available' },
      { status: 503, headers },
    );
  }
}
