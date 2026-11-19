import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
import { Loading } from '../Loading/Loading.js';
import { Head } from '../SectionHead/Head.js';

export function Digest({ cases }) {
  const he = UI_HE;
  const changes = Array.isArray(cases?.changes) ? cases.changes : [];
  const state = cases?.digestState || 'loading';
  const hasComparison = Number(cases?.sourceComparable) > 0;
  const absent =
    !hasComparison || state === 'insufficient_comparison'
      ? he
        ? 'אין מספיק נתונים בני השוואה בין שתי הבדיקות כדי לקבוע שלא חל שינוי.'
        : 'Недостаточно сопоставимых данных между проверками, чтобы утверждать отсутствие изменений.'
      : he
        ? 'לא נרשמו שינויים בתיקי המעקב או בהחלטת הניטור בין שתי הבדיקות. אין בכך כדי לשלול אירועים שלא זוהו.'
        : 'Между двумя проверками не зарегистрировано изменений досье или решений мониторинга. Это не означает, что событий не было.';
  const formatDate = x => h('bdi', { dir: 'ltr' }, fmtTime(x));
  const meta = (label, value, cls = '') =>
    h(
      'div',
      { className: 'rw-digest-meta-item ' + cls },
      t('span', 'rw-digest-meta-label', label),
      h('strong', null, value),
    );
  return h(
    'section',
    { className: 'section rw-digest', id: 'changes' },
    h(Head, {
      title: he ? 'מה השתנה' : 'Что изменилось',
      icon: 'activity',
      sub: he
        ? 'השוואת שתי בדיקות ניטור, לא ספירת כותרות חדשות'
        : 'Сравнение двух циклов мониторинга, а не счётчик новостей',
    }),
    !cases || state === 'loading'
      ? h(Loading, { label: he ? 'משווים את מחזורי המעקב…' : 'Сравниваем два последних цикла мониторинга…' })
      : state === 'error'
        ? h(
            'p',
            { className: 'error', role: 'alert' },
            he ? 'נתוני ההשוואה אינם זמינים כרגע.' : 'Не удалось загрузить сравнение циклов мониторинга.',
          )
        : state === 'pending'
          ? t(
              'p',
              'hint',
              he ? 'עדיין אין שתי בדיקות להשוואה.' : 'Пока недостаточно завершённых проверок для сравнения.',
            )
          : h(
              'div',
              { className: 'rw-digest-grid' },
              ...changes.map(x =>
                h(
                  'div',
                  { className: 'rw-digest-item', key: x.id },
                  h('div', { className: 'rw-digest-icon', 'aria-hidden': 'true' }, '✦'),
                  h(
                    'div',
                    null,
                    t('strong', null, he ? x.title_he || 'עדכון' : x.title),
                    t('p', null, he ? x.description_he || 'עדכון ברשומה' : x.description),
                    x.story_id
                      ? h(
                          'a',
                          { href: (he ? '/he' : '') + '/events?story=' + encodeURIComponent(x.story_id) },
                          he ? 'פתיחת התיק' : 'Открыть досье',
                        )
                      : null,
                    h('small', null, he ? 'עודכן: ' : 'Обновлено: ', formatDate(x.time)),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'rw-digest-summary' },
                !changes.length ? t('p', 'rw-digest-empty', absent) : null,
                h(
                  'div',
                  { className: 'rw-digest-meta' },
                  cases.previousCheck && cases.lastCheck
                    ? meta(
                        he ? 'תקופת ההשוואה' : 'Период сравнения',
                        h('span', null, formatDate(cases.previousCheck), ' — ', formatDate(cases.lastCheck)),
                        'rw-digest-period',
                      )
                    : null,
                  hasComparison
                    ? meta(
                        he ? 'מקורות עם עדכון' : 'Обновились источники',
                        h(
                          'span',
                          null,
                          h(
                            'bdi',
                            { dir: 'ltr' },
                            String(Number(cases.sourceUpdates) || 0) +
                              ' / ' +
                              String(Number(cases.sourceComparable)),
                          ),
                        ),
                        'rw-digest-source-count',
                      )
                    : null,
                  meta(
                    he ? 'בדיקה אחרונה' : 'Последняя проверка',
                    formatDate(cases.lastCheck),
                    'rw-digest-checktime',
                  ),
                ),
                t(
                  'p',
                  'rw-digest-disclaimer',
                  he ? 'פירוט הכיסוי — במדור נתונים.' : 'Подробности покрытия — в разделе «Данные».',
                ),
              ),
            ),
  );
}
