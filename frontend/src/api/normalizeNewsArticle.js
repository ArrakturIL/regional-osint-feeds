export function rwNormalizeNewsArticle(x) {
  return {
    id: x.event_id || x.id,
    event_id: x.event_id,
    source: x.source,
    title: x.headline || '',
    original: x.headline,
    excerpt: x.summary || '',
    comment: x.comment,
    url: x.url,
    time: Number.isFinite(x.published_ms) ? new Date(x.published_ms).toISOString() : null,
    priority: x.priority,
    verification_status: x.verification_status,
    source_count: x.source_count,
    reporting_origin_count: x.reporting_origin_count,
    article_count: x.article_count,
    translation_state: x.translation_state,
    content_language: x.content_language,
    related: Array.isArray(x.sources)
      ? x.sources
          .filter(s => s?.url && s.article_id !== x.display_article_id)
          .map(s => ({
            id: s.article_id,
            url: s.url,
            source: s.publisher || s.source,
            title: s.source || s.publisher || '',
            time: Number.isFinite(s.published_ms) ? new Date(s.published_ms).toISOString() : null,
          }))
      : [],
  };
}
