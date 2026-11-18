import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
import { External } from '../External/External.js';
import { rwMeaningfulTimeline } from '../../utils/timeline.js';
import { rwSpecificUnknown } from '../../utils/unknowns.js';
import {
  dossierStatus,
  eventDateLabel,
  originalLanguageNote,
  relatedCount,
  sourceCount,
} from '../../utils/dossierMeta.js';
export function StoryDossier({ story, open, onToggle }) {
  const labels = UI_HE
    ? {
        updated: 'עודכן ',
        notVerified: 'סטטוס האימות אינו ידוע',
        additional: 'פרטים נוספים',
        expand: 'פרטים ומקורות +',
        close: 'סגירת פרטים −',
        sources: 'מקורות',
        related: 'פרסומים קשורים',
        unclear: 'מה עדיין לא ברור',
        uncertainty: 'המידע הזמין אינו מאפשר לאמת את כל הטענות.',
        none: 'אין קישור מאומת לרשומת המקור',
        event: 'אירוע: ',
        recorded: 'נרשם: ',
      }
    : {
        updated: 'Обновлено ',
        notVerified: 'Статус подтверждения не установлен',
        additional: 'Дополнительные факты',
        expand: 'Подробности и источники +',
        close: 'Свернуть подробности −',
        sources: 'Первоисточники',
        related: 'Связанные публикации',
        unclear: 'Что остаётся неясным',
        uncertainty: 'Данные мониторинга не позволяют установить степень подтверждения.',
        none: 'Проверяемой ссылки на исходную запись нет.',
        event: 'Событие: ',
        recorded: 'В журнале: ',
      };
  const sources = Array.isArray(story.sources) ? story.sources : [],
    date = story.eventDate || story.event_date,
    status = dossierStatus(sources.length, UI_HE);
  return h(
    'article',
    { className: 'rw-dossier', id: 'case-' + story.id, tabIndex: -1 },
    h(
      'div',
      { className: 'rw-dossier-top' },
      h(
        'div',
        { className: 'rw-story-meta' },
        story.type ? t('span', null, story.type) : null,
        t('span', null, labels.updated + fmtTime(story.observedAt)),
      ),
      h(
        'div',
        { className: 'rw-verification-tags' },
        h('span', { className: 'rw-status-tag uncertain rw-status-tag--' + status.level }, status.text),
      ),
      h('h3', { dir: 'auto', lang: story.content_language || undefined }, story.title),
      story.content_language && story.content_language !== (UI_HE ? 'he' : 'ru')
        ? h(
            'small',
            { className: 'rw-translation-state' },
            originalLanguageNote(story.content_language, UI_HE),
          )
        : null,
      date
        ? t(
            'p',
            'rw-event-meta',
            labels.event + eventDateLabel(date, UI_HE) + ' · ' + labels.recorded + fmtTime(story.observedAt),
          )
        : null,
      t('p', null, story.summary || story.excerpt || ''),
      story.context
        ? t('div', 'rw-dossier-insight', t('strong', null, labels.additional), t('p', null, story.context))
        : null,
      h(
        'div',
        { className: 'rw-dossier-actions' },
        h(
          'button',
          {
            type: 'button',
            'aria-expanded': !!open,
            'aria-controls': 'case-details-' + story.id,
            onClick: () => onToggle(open ? null : story.id),
          },
          open ? labels.close : labels.expand,
        ),
        t(
          'span',
          null,
          [sourceCount(sources.length, UI_HE), relatedCount(story.related?.length, UI_HE)]
            .filter(Boolean)
            .join(' · '),
        ),
      ),
    ),
    open
      ? h(
          'div',
          { className: 'rw-dossier-detail', id: 'case-details-' + story.id },
          !UI_HE ? rwMeaningfulTimeline(story) : null,
          rwSpecificUnknown(story)
            ? h(
                'div',
                { className: 'rw-dossier-unknown' },
                t('strong', null, labels.unclear),
                t('p', null, rwSpecificUnknown(story)),
              )
            : null,
          t('strong', null, labels.sources),
          sources.length
            ? h(
                'div',
                { className: 'rw-link-list' },
                ...sources.map((s, i) => h(External, { key: s.url || i, url: s.url }, s.label + ' ↗')),
              )
            : t('p', 'hint', labels.none),
          story.related?.length
            ? h(
                'div',
                null,
                t('strong', null, labels.related),
                ...story.related.map((r, i) =>
                  h(
                    'div',
                    { className: 'rw-related-line', key: r.id || i },
                    h(External, { url: r.url }, r.title || r.source || labels.sources),
                    t('small', null, fmtTime(r.time)),
                  ),
                ),
              )
            : null,
        )
      : null,
  );
}
