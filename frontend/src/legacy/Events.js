import { fmtTime, h, t } from '../app/runtime.js';
import { External } from '../components/External/External.js';
export function Events({ items }) {
  if (!items?.length) return t('p', 'hint', 'Пока нет зарегистрированных событий.');
  return h(
    'div',
    null,
    ...items.map((x, i) =>
      h(
        'article',
        { className: 'event', key: x.id || i },
        h('time', { dateTime: x.date }, fmtTime(x.date)),
        t('h4', null, x.title || 'Событие'),
        t('p', null, x.description || 'Описание отсутствует'),
        h(External, { url: x.link }, 'Первоисточник ↗'),
      ),
    ),
  );
}
