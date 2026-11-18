import { UI_HE, safeLink } from '../app/runtime.js';
import { HE_CATEGORY } from '../i18n/meta.js';
import { rwSourceLabel } from '../utils/sourceLabel.js';
export function normalizeCase(story) {
  const category = String(story.category || story.group || story.type || '').toLowerCase();
  const group = /aviation|air|carrier|militar/.test(category)
    ? 'aviation'
    : /maritime|sea|ship|naval/.test(category)
      ? 'maritime'
      : /security|preparation|strike|israel|iran/.test(category)
        ? 'security'
        : 'other';
  const sources = Array.isArray(story.sources)
    ? story.sources
        .map((s, i) => {
          const url = typeof s === 'string' ? s : s?.url || s?.source_url || s?.link;
          return { url, label: rwSourceLabel(s, i) };
        })
        .filter(s => safeLink(s.url))
    : [];
  if (!sources.length && safeLink(story.url))
    sources.push({ url: story.url, label: UI_HE ? 'מקור ראשוני' : 'Первоисточник' });
  const date = story.updated_at_ms
    ? new Date(story.updated_at_ms).toISOString()
    : story.observedAt || story.collected_at || story.time || story.published_at || story.event_date;
  return {
    ...story,
    group,
    type: UI_HE
      ? HE_CATEGORY[story.category] ||
        { aviation: 'תעופה', maritime: 'ים', security: 'ביטחון', other: 'אחר' }[group]
      : story.type ||
        { aviation: 'Авиация', maritime: 'Море', security: 'Безопасность', other: 'Прочее' }[group],
    eventDate: story.eventDate || story.event_date,
    observedAt: date,
    summary: story.summary || story.excerpt || story.body || '',
    sources,
  };
}
