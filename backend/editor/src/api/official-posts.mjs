function rwOfficialTextParts(heading, body) {
  const h = String(heading || '').trim(),
    b = String(body || '').trim();
  if (!b) return { title: h, description: '' };
  if (!h || !b.startsWith(h)) return { title: h, description: b };
  const cut = b.length > h.length && /[\p{L}\p{N}]$/u.test(h) && /^[\p{L}\p{N}]/u.test(b.slice(h.length));
  if (cut) {
    const clauses = [': ', '. ', '; ']
      .map(sep => ({ at: b.lastIndexOf(sep, h.length), length: sep.length }))
      .filter(x => x.at >= 65);
    clauses.sort((a, b) => b.at - a.at);
    if (clauses.length) {
      const end = clauses[0].at + 1;
      return {
        title: b.slice(0, end).trim(),
        description: b
          .slice(end)
          .replace(/^[\s.:,;—–-]+/u, '')
          .trim(),
      };
    }
    const ix = h.lastIndexOf(' ');
    if (ix > 45) return { title: h.slice(0, ix).trim() + '…', description: b.slice(ix + 1).trim() };
  }
  return {
    title: h,
    description: b
      .slice(h.length)
      .replace(/^[\s.:,;—–-]+/u, '')
      .trim(),
  };
}
function rwOfficialDecode(s) {
  return String(s || '')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&');
}
function rwOfficialNumbersPreserved(source, translated) {
  const from = rwOfficialDecode(source).match(/\d+/g) || [],
    to = String(translated).match(/\d+/g) || [];
  for (const v of from) {
    const i = to.indexOf(v);
    if (i < 0) return false;
    to.splice(i, 1);
  }
  return true;
}
export async function readOfficialPosts(request, env) {
  const query = new URL(request.url).searchParams,
    lang = query.get('lang') || 'ru',
    n = query.get('limit') || '5',
    limit = Number(n);
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public,max-age=60',
    'X-Content-Type-Options': 'nosniff',
  };
  if (!['ru', 'he'].includes(lang) || !Number.isInteger(limit) || limit < 1 || limit > 10)
    return Response.json({ error: 'invalid_request' }, { status: 400, headers });
  const sql =
    "SELECT o.id,o.observed_at,o.payload FROM observations o JOIN (SELECT id,MAX(observed_at) newest FROM observations WHERE source='idf_official' GROUP BY id) x ON x.id=o.id AND x.newest=o.observed_at WHERE o.source='idf_official' ORDER BY json_extract(o.payload,'$.published_at') DESC,o.id ASC LIMIT ?";
  const rows =
      (
        await env.CORE_DB.prepare(sql)
          .bind(Math.max(20, limit * 3))
          .all()
      ).results || [],
    posts = [],
    seen = new Set();
  for (const row of rows) {
    let src;
    try {
      src = JSON.parse(row.payload);
    } catch {
      continue;
    }
    if (!/^https:\/\/t\.me\/idfofficial\/\d+$/.test(String(src.url || '')) || seen.has(row.id)) continue;
    seen.add(row.id);
    posts.push({ id: row.id, observed_at: row.observed_at, source: src });
    if (posts.length >= limit) break;
  }
  const urls = posts.map(x => x.source.url);
  const translations = urls.length
    ? (
        await env.NEWS_DB.prepare(
          'SELECT url,title_ru,excerpt_ru,model,translated_ms FROM official_translations WHERE url IN (' +
            urls.map(() => '?').join(',') +
            ')',
        )
          .bind(...urls)
          .all()
      ).results || []
    : [];
  const byURL = new Map(translations.map(x => [x.url, x]));
  const items = posts.map(post => {
    const s = post.source,
      tr = byURL.get(s.url),
      rawTitle = rwOfficialDecode(s.title),
      rawExcerpt = rwOfficialDecode(s.excerpt || s.title);
    const ready =
      lang === 'ru' &&
      tr &&
      /[А-Яа-яЁё]/u.test(tr.title_ru || '') &&
      /[А-Яа-яЁё]/u.test(tr.excerpt_ru || '') &&
      rwOfficialNumbersPreserved(rawExcerpt, tr.excerpt_ru);
    const language = ready ? 'ru' : 'en',
      summary = rwOfficialTextParts(ready ? tr.title_ru : rawTitle, ready ? tr.excerpt_ru : rawExcerpt);
    return {
      id: post.id,
      url: s.url,
      title: summary.title,
      description: summary.description,
      original_title: rawTitle,
      original_description: rawExcerpt,
      published: s.published_at || null,
      observed: new Date(post.observed_at).toISOString(),
      content_language: language,
      field_languages: { title: language, description: language },
      translation_status: ready ? 'available' : tr && lang === 'ru' ? 'needs_review' : 'pending',
      source_language: 'en',
      translation_model: ready ? tr.model : null,
      translation_verified: false,
      source_type: 'official_idf_telegram',
    };
  });
  return Response.json(
    {
      requested_language: lang,
      items,
      total: items.length,
      source: 'idf_official',
      translation_disclaimer: 'Machine translation; refer to the original official statement.',
    },
    { headers },
  );
}
