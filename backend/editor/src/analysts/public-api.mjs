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
      // 22.11: a count per author for the filter chips.
      "SELECT a.id,a.display_name,a.description,(SELECT count(*) FROM analyst_publications p WHERE p.analyst_id=a.id AND p.status IN ('published','corrected')) AS posts FROM analysts a WHERE a.enabled=1 ORDER BY a.display_name",
    ).all();
    return json({ analysts: q.results || [] });
  }
  if (path === '/api/analyst-posts' || /^\/api\/analyst-posts\/[a-z0-9-]+$/.test(path)) {
    const detail = path !== '/api/analyst-posts';
    const id = detail ? path.split('/').pop() : null;
    const limit = Math.max(1, Math.min(40, Number(url.searchParams.get('limit') || 20) || 20));
    const offset = Math.max(0, Math.min(2000, Number(url.searchParams.get('offset') || 0) || 0));
    // 22.11: filter by author (analyst id) and search all publications (not only
    // the page the browser has). LIKE wildcards in the query are escaped.
    const author = /^[a-z0-9-]{1,60}$/.test(url.searchParams.get('author') || '')
      ? url.searchParams.get('author')
      : '';
    const text = String(url.searchParams.get('q') || '')
      .trim()
      .slice(0, 80);
    // SQLite LIKE ignores case only for Latin; for Cyrillic and Hebrew search the
    // lower-case and the capitalised form («иран» finds «Иран»).
    const esc = x => '%' + x.replace(/[\\%_]/g, m => '\\' + m) + '%';
    const lower = text.toLocaleLowerCase('ru');
    const forms = [...new Set([lower, lower.charAt(0).toLocaleUpperCase('ru') + lower.slice(1), text])].map(
      esc,
    );
    const filter = { sql: '', args: [] };
    if (author) {
      filter.sql += ' AND p.analyst_id=?';
      filter.args.push(author);
    }
    if (text) {
      const cols = ['p.headline', 'p.summary', 'p.short_quote', 'a.display_name'];
      filter.sql +=
        ' AND (' + forms.flatMap(() => cols.map(c => c + " LIKE ? ESCAPE '\\'")).join(' OR ') + ')';
      for (const f of forms) filter.args.push(...cols.map(() => f));
    }
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
      FROM analyst_publications p JOIN analysts a ON a.id=p.analyst_id JOIN analyst_items i ON i.id=p.item_id JOIN analyst_sources s ON s.id=i.source_id WHERE p.status IN ('published','corrected')${filter.sql}
      ORDER BY p.published_at_ms DESC,p.id DESC LIMIT ? OFFSET ?`,
        )
          .bind(...filter.args, limit + 1, offset)
          .all();
    // One row more than asked tells whether there is a next page.
    const more = !detail && (q.results || []).length > limit;
    if (more) q.results = q.results.slice(0, limit);
    if (detail && !q.results?.length) return json({ error: 'not_found' }, 404);
    return json(
      detail
        ? q.results[0]
        : {
            posts: q.results || [],
            has_more: more,
            disclaimer:
              'Attributed analyst interpretations. Claims not independently verified unless indicated.',
          },
    );
  }
  return json({ error: 'not_found' }, 404);
}
