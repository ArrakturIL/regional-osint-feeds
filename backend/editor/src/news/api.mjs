// Event-card response compatible with the legacy /api/news articles DTO.
import { eventRows, reconcile, hebrew, publisher, language } from './events.mjs';
import { localizeNewsRow } from '../localization/localization.mjs';
import { displayForPage } from '../localization/display-policy.mjs';
import { newsTier } from './tier.mjs';
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public,max-age=60',
  'X-Content-Type-Options': 'nosniff',
};
const respond = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
// Fixed across page sizes, otherwise offset pagination reorders earlier rows.
const SOFT_PUBLISHER_CAP = 7;
const validInt = (value, max, defaultValue) =>
  value === null
    ? defaultValue
    : /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= max
      ? Number(value)
      : null;
export async function readNewsEvents(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'GET') return respond({ error: 'read_only' }, 405);
  const url = new URL(request.url),
    lang = url.searchParams.get('lang') || 'ru';
  if (!['he', 'ru'].includes(lang)) return respond({ error: 'invalid_language' }, 400);
  const limit = validInt(url.searchParams.get('limit'), 40, 20);
  const offset = validInt(url.searchParams.get('offset'), 2000, 0);
  if (limit === null || limit < 1 || offset === null) return respond({ error: 'invalid_pagination' }, 400);
  const sort = url.searchParams.get('sort') || 'latest';
  if (sort !== 'latest' && sort !== 'priority') return respond({ error: 'invalid_sort' }, 400);
  // Offset-based continuation is safe only while the ordered event IDs remain
  // unchanged. Existing clients may omit this optional guard.
  const expectedOrderHash = url.searchParams.get('expected_order_hash');
  if (expectedOrderHash !== null && !/^[a-f0-9]{64}$/i.test(expectedOrderHash))
    return respond({ error: 'invalid_order_hash' }, 400);
  // C-06: API filtering is locale-independent and always precedes sort,
  // diversity caps and offset pagination. A selection inside one facet is OR;
  // selections across facets are AND. No client-side partial-page filtering.
  const selection = (name, maxLength = 120) => {
    const raw = url.searchParams.getAll(name);
    if (raw.length > 20 || raw.some(x => !x.trim() || x.length > maxLength)) return null;
    return [...new Set(raw.map(x => x.trim()))];
  };
  const sources = selection('source');
  const categories = selection('category', 64);
  const verifications = selection('verification', 64);
  const validSlugs = items => items !== null && items.every(x => /^[a-z][a-z0-9_]{0,63}$/.test(x));
  const dateParam = name => {
    const raw = url.searchParams.getAll(name);
    if (!raw.length) return null;
    if (raw.length !== 1 || !/^\d{1,16}$/.test(raw[0])) return NaN;
    const ms = Number(raw[0]);
    return Number.isSafeInteger(ms) && ms > 0 ? ms : NaN;
  };
  const fromMs = dateParam('from_ms'),
    toMs = dateParam('to_ms');
  const rawPriority = url.searchParams.getAll('min_priority');
  const minPriority =
    rawPriority.length === 0
      ? null
      : rawPriority.length === 1 && /^\d{1,2}$/.test(rawPriority[0]) && Number(rawPriority[0]) <= 10
        ? Number(rawPriority[0])
        : NaN;
  if (
    sources === null ||
    !validSlugs(categories) ||
    !validSlugs(verifications) ||
    Number.isNaN(fromMs) ||
    Number.isNaN(toMs) ||
    Number.isNaN(minPriority) ||
    (fromMs !== null && toMs !== null && fromMs > toMs)
  )
    return respond({ error: 'invalid_filters' }, 400);
  const applied_filters = {
    sources,
    categories,
    verifications,
    min_priority: minPriority,
    from_ms: fromMs,
    to_ms: toMs,
  };
  const requestedReadyOnly = ['1', 'true'].includes(url.searchParams.get('ready_only'));
  // Main feed is locale-invariant; never hide events because translation is pending.
  const readyOnly = false;
  // Paginate the complete eligible event pool, not a silently truncated first 200.
  let rows = await eventRows(env.NEWS_DB, null);
  // Initialize the event index once on first public request, avoiding an empty
  // homepage during the first five-minute cron window after deployment.
  if (!rows.length) {
    const exists = await env.NEWS_DB.prepare('SELECT COUNT(*) n FROM news_event_groups').first();
    if (!(exists?.n || 0)) {
      await reconcile(env.NEWS_DB);
      rows = await eventRows(env.NEWS_DB, null);
    }
  }
  // Sort the complete raw event pool before doing any per-row i18n D1 reads.
  // Feed order and publisher diversity must remain independent of language/page size.
  // The Latest feed is newest-first, without silently promoting older priority items.
  const sourceNames = new Set(sources.map(x => x.toLowerCase()));
  const categoryNames = new Set(categories);
  const verificationNames = new Set(verifications);
  const matching = rows.filter(row => {
    if (fromMs !== null && Number(row.last_seen_ms) < fromMs) return false;
    if (toMs !== null && Number(row.last_seen_ms) > toMs) return false;
    if (minPriority !== null && Number(row.event_priority) < minPriority) return false;
    if (categoryNames.size && !categoryNames.has(String(row.topic || '').toLowerCase())) return false;
    if (verificationNames.size && !verificationNames.has(String(row.verification_status || '').toLowerCase()))
      return false;
    if (sourceNames.size) {
      let members = [];
      try {
        members = JSON.parse(row.sources_json || '[]');
      } catch {}
      if (!Array.isArray(members)) members = [];
      const names = [row.source, publisher(row.source), ...members.flatMap(x => [x?.source, x?.publisher])];
      if (!names.some(x => typeof x === 'string' && sourceNames.has(x.toLowerCase()))) return false;
    }
    return true;
  });
  let visible = matching
    .map(row => ({
      row,
      event_id: row.event_id,
      published_ms: row.last_seen_ms,
      priority: row.event_priority,
      _owner: publisher(row.source),
    }))
    .sort((a, b) =>
      sort === 'latest'
        ? b.published_ms - a.published_ms || String(a.event_id).localeCompare(String(b.event_id))
        : b.priority - a.priority ||
          b.published_ms - a.published_ms ||
          String(a.event_id).localeCompare(String(b.event_id)),
    );
  // Soft diversity: high-impact stories are never blocked to satisfy quotas.
  const cap = SOFT_PUBLISHER_CAP,
    counts = new Map(),
    regular = [],
    deferred = [];
  for (const e of visible) {
    if (sort === 'latest') {
      regular.push(e);
      continue;
    }
    const n = counts.get(e._owner) || 0;
    if (e.priority >= 9 || n < cap) {
      regular.push(e);
      counts.set(e._owner, n + 1);
    } else deferred.push(e);
  }
  visible = [...regular, ...deferred];
  const orderData = new TextEncoder().encode(visible.map(x => x.event_id).join('|'));
  const digest = await crypto.subtle.digest('SHA-256', orderData);
  const feed_order_hash = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  if (expectedOrderHash !== null && expectedOrderHash.toLowerCase() !== feed_order_hash)
    return Response.json(
      { error: 'feed_changed', feed_order_hash, restart_offset: 0, sort },
      { status: 409, headers: { ...HEADERS, 'Cache-Control': 'no-store' } },
    );
  const pageRows = visible.slice(offset, offset + limit).map(x => x.row);
  // A native Hebrew source is already translated; do not require Workers AI
  // translation for its appearance in the Hebrew edition.
  const substitutions = new Map();
  if (lang === 'he') {
    const hebrewChoices = [];
    for (const r of pageRows) {
      if (hebrew(r.headline)) continue;
      if (r.he_hash && r.he_title) continue;
      const choices = JSON.parse(r.sources_json || '[]').filter(x => x.language === 'he');
      if (choices.length) hebrewChoices.push({ event_id: r.event_id, article_id: choices[0].article_id });
    }
    if (hebrewChoices.length) {
      const ids = [...new Set(hebrewChoices.map(x => x.article_id))].slice(0, 150);
      const sql =
        'SELECT id,source,headline,headline_ru,summary,summary_ru,comment,url,published_ms,priority FROM news_items WHERE id IN (' +
        ids.map(() => '?').join(',') +
        ')';
      const native =
        (
          await env.NEWS_DB.prepare(sql)
            .bind(...ids)
            .all()
        ).results || [];
      const byId = new Map(native.map(x => [x.id, x]));
      for (const x of hebrewChoices)
        if (byId.has(x.article_id)) substitutions.set(x.event_id, byId.get(x.article_id));
    }
  }
  const translated = await Promise.all(
    pageRows.map(async r => {
      const alternative = substitutions.get(r.event_id);
      const row = alternative
        ? {
            ...r,
            ...alternative,
            he_hash: null,
            he_title: null,
            he_body: null,
            he_comment: null,
            he_quality: null,
          }
        : r;
      // B4: page language rules; null = withheld from this page until translated.
      const t = displayForPage(row, await localizeNewsRow(env.NEWS_DB, row, lang), lang);
      if (!t) return null;
      const native = lang === 'he' && hebrew(row.headline) && t.content_language === 'he';
      const available =
        t.content_language === lang &&
        (t.translation_status === 'source' || t.translation_status === 'available');
      const state = available
        ? native || t.translation_status === 'source'
          ? 'original'
          : 'translated'
        : t.translation_status === 'needs_review'
          ? 'needs_review'
          : 'pending';
      const label =
        state === 'original'
          ? lang === 'he'
            ? 'שפת המקור'
            : 'Оригинал'
          : state === 'translated'
            ? lang === 'he'
              ? 'תורגם'
              : 'Переведено'
            : state === 'needs_review'
              ? lang === 'he'
                ? 'בבדיקת תרגום'
                : 'Перевод проверяется'
              : lang === 'he'
                ? 'ממתין לתרגום'
                : 'Перевод ожидается';
      // The event's latest report is not the original representative article.
      // Expose both time bases and every publisher's claim without claiming fact verification.
      const sources = JSON.parse(r.sources_json || '[]');
      const publishedTimes = sources.map(s => s.published_ms).filter(t => Number.isSafeInteger(t) && t > 0);
      const representativePublished =
        Number.isSafeInteger(row.published_ms) && row.published_ms > 0 ? row.published_ms : null;
      const firstSeen = publishedTimes.length ? Math.min(...publishedTimes) : representativePublished;
      const latestSeen = Number.isSafeInteger(r.last_seen_ms) && r.last_seen_ms > 0 ? r.last_seen_ms : null;
      const collectedTimes = sources.map(s => s.collected_ms).filter(t => Number.isSafeInteger(t) && t > 0);
      const firstCollected = collectedTimes.length ? Math.min(...collectedTimes) : null;
      const lastCollected = collectedTimes.length ? Math.max(...collectedTimes) : null;
      const sourceAssertions = sources.map(s => ({
        article_id: s.article_id,
        source: s.source,
        claimed_by: s.claimed_by,
        source_assertion: s.source_assertion || 'not_reported',
      }));
      // Immutable original article provenance, independent from a translated
      // display headline and from the Hebrew i18n cache's source hash.
      const originalHeadline = String(row.headline || '').trim(),
        originalSummary = String(row.summary || '').trim();
      const sourceHashBytes = new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify([originalHeadline, originalSummary])),
        ),
      );
      const sourceHash = Array.from(sourceHashBytes, x => x.toString(16).padStart(2, '0')).join('');
      const fieldState = (original, shown) => {
        if (!original && !shown) return 'not_applicable';
        if (t.source_language === lang && shown === original) return 'source';
        if (t.content_language !== lang) return state === 'needs_review' ? 'needs_review' : 'pending';
        if (shown === original && t.source_language !== lang) return 'pending';
        return state === 'translated' ? 'available' : state === 'original' ? 'source' : state;
      };
      const fieldTranslationStatus = {
        headline: fieldState(originalHeadline, t.title),
        summary: fieldState(originalSummary, t.body),
      };
      return {
        event_id: r.event_id,
        id: r.id,
        canonical_article_id: r.id,
        display_article_id: row.id,
        source: row.source,
        event_first_seen_ms: firstSeen,
        event_last_seen_ms: latestSeen,
        representative_published_ms: representativePublished,
        event_earliest_published_ms: firstSeen,
        event_latest_published_ms: latestSeen,
        event_first_collected_ms: firstCollected,
        event_last_collected_ms: lastCollected,
        event_at_ms: null,
        event_first_seen_basis: 'source_publication',
        event_last_seen_basis: 'source_publication',
        event_collection_basis: 'first_ingestion_observation',
        sort_basis: 'event_last_seen_ms',
        independent_verification: 'not_established',
        source_assertions: sourceAssertions,
        original_language: t.source_language,
        original_headline: originalHeadline,
        original_summary: originalSummary,
        source_hash: sourceHash,
        field_translation_status: fieldTranslationStatus,
        headline: t.title,
        summary: t.body,
        comment: t.comment,
        url: row.url,
        published_ms: r.last_seen_ms,
        priority: r.event_priority,
        category: r.topic,
        ...(({ tier, reason }) => ({ tier, tier_reason: reason }))(newsTier(row)),
        content_language: t.content_language,
        language_shown: t.language_shown,
        source_language: t.source_language,
        translation_status: t.translation_status,
        translation_state: state,
        translation_label: label,
        translation_available: available,
        translation: {
          state,
          label,
          available,
          requested_language: lang,
          display_language: t.content_language,
        },
        verification_status: r.verification_status,
        source_count: r.source_count,
        reporting_origin_count: r.origin_count,
        article_count: r.member_count,
        sources,
        reason_codes: JSON.parse(r.reason_codes || '[]'),
        _owner: publisher(r.source),
      };
    }),
  );
  // Ranks are positions in the feed, so a withheld item keeps the others' ranks stable.
  const output = translated
    .map((x, i) => {
      if (!x) return null;
      const { _owner, ...rest } = x;
      return { ...rest, feed_rank: offset + i };
    })
    .filter(Boolean);
  const withheld_count = translated.length - output.length;
  // B5: per-tier translation SLA, refreshed by the scheduled translator.
  let translation_sla = null;
  try {
    const x = await env.NEWS_DB.prepare("SELECT value FROM editor_state WHERE key='translation_sla'").first();
    translation_sla = x?.value ? JSON.parse(x.value) : null;
  } catch {}
  return respond({
    requested_language: lang,
    articles: output,
    events: output,
    localized_count: output.filter(x => x.content_language === lang).length,
    translation_summary: {
      available: output.filter(x => x.translation_available).length,
      pending: output.filter(x => x.translation_state === 'pending').length,
      needs_review: output.filter(x => x.translation_state === 'needs_review').length,
    },
    withheld_count,
    translation_sla,
    limit,
    offset,
    total_events: visible.length,
    applied_filters,
    feed_order_hash,
    next_offset: visible.length > offset + limit ? offset + limit : null,
    ready_only: readyOnly,
    requested_ready_only: requestedReadyOnly,
    sort,
    grouping: 'event_v1',
    status: 'published',
    source_policy: 'attributed_reporting_not_fact_verification',
  });
}
