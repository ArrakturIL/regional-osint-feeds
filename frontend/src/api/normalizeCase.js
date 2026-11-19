import { UI_HE, safeLink } from '../app/runtime.js';
import { HE_CATEGORY } from '../i18n/meta.js';
import { rwSourceLabel } from '../utils/sourceLabel.js';
// 19.11: groups by whole words of the monitor category, not substrings.
// /militar/ sent "high_level_military_coordination" (CENTCOM–IDF–Mossad
// meeting) to Aviation, and "air" matched inside other words. Air defence and
// air campaigns are security; aircraft-carrier posture is maritime.
const CASE_MARITIME = new Set([
  'maritime',
  'sea',
  'ship',
  'shipping',
  'naval',
  'navy',
  'vessel',
  'tanker',
  'port',
  'hormuz',
  'carrier',
]);
const CASE_AVIATION = new Set([
  'aviation',
  'airspace',
  'flight',
  'flights',
  'airline',
  'airlines',
  'airport',
  'adsb',
  'notam',
]);
const CASE_AIR_SECURITY = new Set(['defence', 'defense', 'campaign', 'strike', 'strikes', 'attack']);
const CASE_SECURITY = new Set([
  'military',
  'security',
  'defense',
  'defence',
  'strike',
  'airstrike',
  'attack',
  'missile',
  'interception',
  'drone',
  'campaign',
  'plot',
  'assassination',
  'intelligence',
  'threat',
  'sanctions',
  'coordination',
  'preparation',
  'readiness',
  'protective',
  'warning',
  'israel',
  'iran',
  'proxy',
  'gaza',
  'war',
  'nuclear',
  'terror',
]);
export function caseGroup(category) {
  const words = String(category || '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (words.some(w => CASE_MARITIME.has(w))) return 'maritime';
  if (words.some((w, i) => CASE_AVIATION.has(w) || (w === 'air' && !CASE_AIR_SECURITY.has(words[i + 1]))))
    return 'aviation';
  if (words.some(w => CASE_SECURITY.has(w))) return 'security';
  return 'other';
}
export function normalizeCase(story) {
  const category = String(story.category || story.group || story.type || '').toLowerCase();
  const group = caseGroup(category);
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
