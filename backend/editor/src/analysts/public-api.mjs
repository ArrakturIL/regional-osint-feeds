const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=120' };

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
export async function readApi(request, env, editorVersion) {
  const url = new URL(request.url),
    path = url.pathname;
  if (request.method !== 'GET') return json({ error: 'read_only' }, 405);
  if (path === '/health') {
    const last = await env.DB.prepare(
      `SELECT started_at_ms,completed_at_ms,status,stats_json,error_message
      FROM analyst_runs ORDER BY started_at_ms DESC LIMIT 1`,
    ).first();
    return json({ service: 'regional-watch-analysts', editor_version: editorVersion, last: last || null });
  }
  if (path === '/api/analysts') {
    const q = await env.DB.prepare(
      'SELECT id,display_name,description FROM analysts WHERE enabled=1 ORDER BY display_name',
    ).all();
    return json({ analysts: q.results || [] });
  }
  if (path === '/api/analyst-posts' || /^\/api\/analyst-posts\/[a-z0-9-]+$/.test(path)) {
    const detail = path !== '/api/analyst-posts';
    const id = detail ? path.split('/').pop() : null;
    const limit = Math.max(1, Math.min(40, Number(url.searchParams.get('limit') || 20) || 20));
    const offset = Math.max(0, Math.min(2000, Number(url.searchParams.get('offset') || 0) || 0));
    const q = detail
      ? await env.DB.prepare(
          `SELECT p.id,p.headline,p.summary,p.short_quote,p.original_url,p.original_published_at_ms,
      p.published_at_ms,p.source_type,p.fact_check_status,p.authorship_status,p.importance_score,
      p.status,p.version,p.editor_version,a.display_name AS analyst,s.language AS original_language
      FROM analyst_publications p JOIN analysts a ON a.id=p.analyst_id JOIN analyst_items i ON i.id=p.item_id JOIN analyst_sources s ON s.id=i.source_id WHERE p.id=? AND p.status IN ('published','corrected')`,
        )
          .bind(id)
          .all()
      : await env.DB.prepare(
          `SELECT p.id,p.headline,p.summary,p.short_quote,p.original_url,p.original_published_at_ms,
      p.published_at_ms,p.source_type,p.fact_check_status,p.authorship_status,p.importance_score,
      p.status,p.version,p.editor_version,a.display_name AS analyst,s.language AS original_language
      FROM analyst_publications p JOIN analysts a ON a.id=p.analyst_id JOIN analyst_items i ON i.id=p.item_id JOIN analyst_sources s ON s.id=i.source_id WHERE p.status IN ('published','corrected')
      ORDER BY p.published_at_ms DESC,p.id DESC LIMIT ? OFFSET ?`,
        )
          .bind(limit, offset)
          .all();
    if (detail && !q.results?.length) return json({ error: 'not_found' }, 404);
    return json(
      detail
        ? q.results[0]
        : {
            posts: q.results || [],
            disclaimer:
              'Attributed analyst interpretations. Claims not independently verified unless indicated.',
          },
    );
  }
  return json({ error: 'not_found' }, 404);
}
