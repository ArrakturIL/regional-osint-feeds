import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
import { HE_CATEGORY } from '../../i18n/meta.js';
import { rwEditorialPending } from '../../utils/editorialPending.js';
import { rwEvidence } from '../../utils/evidence.js';
export function StoryTeaser({ story, go }) {
  const type = UI_HE ? HE_CATEGORY[story.category] || 'אירוע' : story.type;
  const summary = story.summary || story.excerpt || story.body || '';
  const sourceCount = Array.isArray(story.sources) ? story.sources.length : 0;
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
      ? h(
          'small',
          { className: 'rw-translation-state' },
          UI_HE
            ? story.content_language === 'en'
              ? 'המקור באנגלית · התרגום ממתין'
              : 'המקור ברוסית · התרגום ממתין'
            : story.content_language === 'en'
              ? 'Оригинал на английском · перевод ожидается'
              : 'Оригинал на иврите · перевод ожидается',
        )
      : null,
    t('p', null, summary),
    !UI_HE && story.context ? t('div', 'rw-story-relevance', 'ДЕТАЛЬ · ' + story.context) : null,
    h(
      'div',
      { className: 'rw-story-footer' },
      t(
        'span',
        null,
        UI_HE
          ? sourceCount +
              ' מקורות · ' +
              (story.verification_status === 'multi_outlet_reporting'
                ? 'דיווחים ממספר כלי תקשורת'
                : 'דיווחי מקורות, ללא אימות עצמאי')
          : sourceCount +
              ' источн. · ' +
              rwEvidence(story).label +
              (rwEditorialPending(story) ? ' · Без редакционного оформления' : ''),
      ),
      h('a', { href: eventPath }, UI_HE ? 'לפתיחת תיק האירוע ←' : 'Открыть досье →'),
    ),
  );
}
