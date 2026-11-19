import { DAY, sourceText } from './shared.mjs';
import { respond, localized, fieldLocale } from './read-core.mjs';
import { allowedOnPage } from './display-policy.mjs';

const DATE_PREFIX = /^\d{4}-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?)?/;

/** Locale-invariant provenance. Never regenerate dates or source links by AI. */
export function storyProvenance(data) {
  const validUrl = value => {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const u = new URL(value);
      if (
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        !u.hostname ||
        /^(?:localhost|127[.]|10[.]|192[.]168[.]|169[.]254[.]|0[.])/.test(u.hostname)
      )
        return null;
      return value;
    } catch {
      return null;
    }
  };
  const sources = [];
  const seen = new Set();
  const add = (url, type) => {
    const safe = validUrl(url);
    if (safe && !seen.has(safe)) {
      sources.push({ url: safe, type: typeof type === 'string' ? type.slice(0, 100) : 'source' });
      seen.add(safe);
    }
  };
  // Q8: the monitor writes links under many keys (primary_url, designation_url,
  // secondary_url, primary_report, independent_reporting[], followup.url…).
  // Every https link it wrote is a source: explicit lists first, then primary
  // keys, then the classic fields, then everything else in payload order.
  const addAny = (value, type) => {
    if (typeof value === 'string') add(value, type);
    else if (Array.isArray(value))
      for (const item of value) {
        if (typeof item === 'string') add(item, type);
        else if (item && typeof item === 'object') add(item.url, item.type || type);
      }
    else if (value && typeof value === 'object') add(value.url, type);
  };
  addAny(data.sources, 'source');
  addAny(data.source_urls, 'listed_source');
  for (const [key, value] of Object.entries(data)) if (/primary/.test(key)) addAny(value, key);
  add(data.source, 'primary');
  add(data.source_url, 'primary');
  add(data.url, 'primary');
  for (const [key, value] of Object.entries(data)) addAny(value, key);
  // Preserve partial dates like 2026-09; inventing a day would be worse.
  // Free text after a date ("… approximate; …") is not part of it.
  const date = value => {
    const m = typeof value === 'string' && value.match(DATE_PREFIX);
    return m ? m[0] : null;
  };
  const firstDate = keys => keys.map(k => date(data[k])).find(Boolean) || null;
  const occurredAt = firstDate([
    'occurred_at',
    'incident_date',
    'event_date',
    'first_report_date',
    'published_date',
  ]);
  const announcedAt =
    date(data.announced_at) ||
    (data.incident_date ? date(data.event_date) : null) ||
    date(data.first_report_date);
  const publishedAt = firstDate([
    'published_date',
    'published_at',
    'publication_date',
    'publication_at',
    'publication_time',
    'first_publication',
  ]);
  return {
    event_date: occurredAt,
    occurred_at: occurredAt,
    announced_at: announcedAt,
    published_at: publishedAt,
    source_date: date(data.first_report_date),
    collected_at: data.first_observed_by_monitor || data.first_verified_monitor_cycle || null,
    source: data.source || null,
    sources,
    source_urls: sources.map(x => x.url),
    url: sources[0]?.url || null,
  };
}

export async function readLocalizedStories(env, lang, lim) {
  const cols = 'SELECT n.event_id,n.category,n.payload,n.updated_at_ms';
  const joined =
    " FROM monitor_events n LEFT JOIN regional_i18n t ON t.kind='story' AND t.item_id=n.event_id AND t.language='he'";
  const ext =
    ',t.source_hash he_hash,t.title he_title,t.body he_body,t.commentary he_comment,t.quality_score he_quality';
  const sql =
    lang === 'he'
      ? cols + ext + joined + ' WHERE n.updated_at_ms>=? ORDER BY n.updated_at_ms DESC LIMIT ?'
      : cols + ' FROM monitor_events n WHERE n.updated_at_ms>=? ORDER BY n.updated_at_ms DESC LIMIT ?';
  const rows = await env.CORE_DB.prepare(sql)
    .bind(Date.now() - 45 * DAY, lim)
    .all();
  const stories = await Promise.all(
    (rows.results || []).map(async n => {
      let data;
      try {
        data = JSON.parse(n.payload);
      } catch {
        return null;
      }
      const original = sourceText('story', data);
      if (!original.title) return null;
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
      const t = await localized(env.CORE_DB, 'story', n.event_id, original, lang, cache);
      if (!allowedOnPage(lang, t.content_language)) return null; // B4: no RU/AR text without translation
      const story = {
        id: n.event_id,
        title: t.title,
        summary: t.body,
        ...storyProvenance(data),
        category: data.category || n.category || null,
        updated_at_ms: n.updated_at_ms,
        content_language: t.content_language,
      };
      return { ...story, ...fieldLocale(story, ['title', 'summary'], lang, t.translation_status) };
    }),
  );
  const valid = stories.filter(Boolean);
  return respond({
    requested_language: lang,
    stories: valid,
    localized_count: valid.filter(x => x.localization_complete).length,
  });
}
