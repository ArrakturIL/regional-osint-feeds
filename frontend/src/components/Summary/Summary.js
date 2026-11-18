import { fmtTime, h, t } from '../../app/runtime.js';
import { Card } from '../Card/Card.js';
import { External } from '../External/External.js';
export function Summary({ overview }) {
  const a = overview?.analysis;
  if (!a) return null;
  return h(
    'section',
    { className: 'section' },
    h(
      Card,
      { className: 'brief' },
      h(
        'div',
        { className: 'panel-header' },
        t('span', 'panel-title', '◉  Главное из последнего анализа'),
        t('span', 'badge' + (a.state === 'attention' ? ' alert' : ''), a.badge || 'АНАЛИЗ'),
      ),
      t('h2', null, a.title || 'Ожидаем аналитическую оценку'),
      t('p', null, a.description || ''),
      h(
        'div',
        { className: 'brief-foot' },
        t('span', null, 'Анализ: ' + fmtTime(a.time)),
        h(External, { url: a.link }, 'Официальный источник ↗'),
      ),
    ),
  );
}
