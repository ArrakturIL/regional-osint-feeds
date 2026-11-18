import { translationIssue } from '../translations/verify.mjs';
import { semanticMeaningIssue } from '../translations/semantic-meaning.mjs';
import { shouldSuppressComment, safePublishedComment } from '../editorial/comment-policy.mjs';
import { DAY, val, sourceText, newsHebrewSource } from './shared.mjs';
import { respond, localized } from './read-core.mjs';
import { displayForPage } from './display-policy.mjs';

/** One trusted localization contract for event and legacy news responses. */
export async function localizeNewsRow(db, row, lang) {
  // The original article language is derived from its original fields, never
  // from headline_ru or a model's self-reported quality score.
  const sourceTitle = val(row.headline, 260),
    sourceBody = val(row.summary, 650);
  const originalLanguage = /[\u0590-\u05ff]/u.test(sourceTitle)
    ? 'he'
    : /[\u0400-\u04ff]/u.test(sourceTitle)
      ? 'ru'
      : 'en';
  const original = {
    title: sourceTitle,
    body: sourceBody,
    comment: val(safePublishedComment(row, row.comment), 300),
  };
  if (lang === 'ru') {
    if (originalLanguage === 'ru')
      return { ...original, content_language: 'ru', source_language: 'ru', translation_status: 'source' };
    const title = val(row.headline_ru, 260),
      body = val(row.summary_ru, 650);
    // A partly translated record is not presented as a complete translation.
    if (!title || !/[\u0400-\u04ff]/u.test(title) || (sourceBody && !body))
      return {
        ...original,
        content_language: originalLanguage,
        source_language: originalLanguage,
        translation_status: 'pending',
      };
    // RU summaries are often abridged, so an entity from a later source
    // sentence may be legitimately absent: the body gets meaning rules only.
    const issue =
      translationIssue(sourceTitle, title, 'ru') ||
      (sourceBody && body ? semanticMeaningIssue(sourceBody, body, 'ru') : null);
    if (issue)
      return {
        ...original,
        content_language: originalLanguage,
        source_language: originalLanguage,
        translation_status: 'needs_review',
        review_reason: issue,
      };
    return {
      ...original,
      title,
      body: body || sourceBody,
      content_language: 'ru',
      source_language: originalLanguage,
      translation_status: 'available',
    };
  }
  if (lang === 'he' && originalLanguage === 'he' && (!sourceBody || /[\u0590-\u05ff]/u.test(sourceBody)))
    return { ...original, content_language: 'he', source_language: 'he', translation_status: 'source' };
  const cached = row.he_hash
    ? {
        source_hash: row.he_hash,
        title: row.he_title,
        body: row.he_body,
        commentary: row.he_comment,
        quality_score: row.he_quality,
      }
    : null;
  const heSource = await newsHebrewSource(row, row.he_hash); // original; legacy pivot only for the manual backlog
  const result = await localized(db, 'news', row.id, heSource.text, lang, cached);
  const issue =
    lang === 'he' && result.translation_status === 'available'
      ? translationIssue(sourceTitle, result.title, 'he') ||
        (sourceBody && result.body ? translationIssue(sourceBody, result.body, 'he') : null)
      : null;
  if (issue)
    return {
      ...original,
      content_language: originalLanguage,
      source_language: originalLanguage,
      translation_status: 'needs_review',
      review_reason: issue,
    };
  return {
    ...(shouldSuppressComment(row) ? { ...result, comment: '' } : result),
    source_language: originalLanguage,
  };
}

export async function readLocalizedNews(env, url, lang, lim, rawOffset) {
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  const readyOnly = lang === 'he' && ['1', 'true'].includes(url.searchParams.get('ready_only'));
  const base =
    'SELECT n.id,n.source,n.headline,n.headline_ru,n.summary,n.summary_ru,n.comment,n.url,n.published_ms,n.priority';
  const extra =
    ',t.source_hash he_hash,t.title he_title,t.body he_body,t.commentary he_comment,t.quality_score he_quality';
  const from =
    " FROM news_items n LEFT JOIN regional_i18n t ON t.kind='news' AND t.item_id=n.id AND t.language='he'";
  const sql =
    lang === 'he'
      ? base +
        extra +
        from +
        ' WHERE n.published_ms>=?' +
        (readyOnly ? ' AND t.quality_score>=85' : '') +
        (readyOnly
          ? ' ORDER BY n.priority DESC,n.published_ms DESC'
          : ' ORDER BY (t.item_id IS NOT NULL) DESC,n.priority DESC,n.published_ms DESC') +
        ' LIMIT ? OFFSET ?'
      : base +
        ' FROM news_items n WHERE n.published_ms>=? ORDER BY n.priority DESC,n.published_ms DESC LIMIT ? OFFSET ?';
  const rows = await env.NEWS_DB.prepare(sql)
    .bind(Date.now() - 7 * DAY, lim, offset)
    .all();
  const articles = await Promise.all(
    (rows.results || []).map(async n => {
      const cache =
        lang === 'he'
          ? {
              source_hash: n.he_hash,
              title: n.he_title,
              body: n.he_body,
              commentary: n.he_comment,
              quality_score: n.he_quality,
            }
          : null;
      const t = displayForPage(n, await localizeNewsRow(env.NEWS_DB, n, lang), lang); // B4
      if (!t) return null;
      return {
        id: n.id,
        source: n.source,
        headline: t.title,
        summary: t.body,
        comment: t.comment,
        url: n.url,
        published_ms: n.published_ms,
        priority: n.priority,
        content_language: t.content_language,
        language_shown: t.language_shown,
        translation_status: t.translation_status,
      };
    }),
  );
  const shown = articles.filter(Boolean);
  const visible = readyOnly
    ? shown.filter(x => x.content_language === 'he' && x.translation_status === 'available')
    : shown;
  return respond({
    requested_language: lang,
    articles: visible,
    localized_count: visible.filter(x => x.content_language === lang).length,
    withheld_count: articles.length - shown.length,
    limit: lim,
    offset,
    next_offset: rows.results?.length === lim ? offset + lim : null,
    ready_only: readyOnly,
  });
}
