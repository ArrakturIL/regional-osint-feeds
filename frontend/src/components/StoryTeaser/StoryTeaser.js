import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
import { HE_CATEGORY } from '../../i18n/meta.js';
import { rwEditorialPending } from '../../utils/editorialPending.js';
import { originalLanguageNote, sourceAttribution } from '../../utils/dossierMeta.js';
export function StoryTeaser({ story, go }) {
  const type = UI_HE ? HE_CATEGORY[story.category] || 'אירוע' : story.type;
  const summary = story.summary || story.excerpt || story.body || '';
  const eventPath = (UI_HE ? '/he' : '') + '/events?story=' + encodeURIComponent(story.id);
  return h(
    'article',
    { className: 'rw-story-teaser' },
    h(
      'div',
      { className: 'rw-story-meta' },
      t('span', null, type),
      t(
        'span',
        null,
        (UI_HE ? 'עודכן ' : 'Обновлено ') +
          fmtTime(story.updated_at_ms || story.observedAt || story.event_date || story.time),
      ),
    ),
    h('h3', { dir: 'auto', lang: story.content_language || undefined }, story.title),
    story.content_language && story.content_language !== (UI_HE ? 'he' : 'ru')
      ? h('small', { className: 'rw-translation-state' }, originalLanguageNote(story.content_language, UI_HE))
      : null,
    t('p', null, summary),
    !UI_HE && story.context ? t('div', 'rw-story-relevance', 'ДЕТАЛЬ · ' + story.context) : null,
    h(
      'div',
      { className: 'rw-story-footer' },
      t(
        'span',
        null,
        sourceAttribution(story.sources, UI_HE).text +
          (!UI_HE && rwEditorialPending(story) ? ' · Без редакционного оформления' : ''),
      ),
      h('a', { href: eventPath }, UI_HE ? 'לפתיחת תיק האירוע ←' : 'Открыть досье →'),
    ),
  );
}
