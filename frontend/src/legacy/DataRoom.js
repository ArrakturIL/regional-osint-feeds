import { fmtTime, h, t, useState } from '../app/runtime.js';
import { Card } from '../components/Card/Card.js';
import { External } from '../components/External/External.js';
import { Loading } from '../components/Loading/Loading.js';
import { Intro } from '../components/PageIntro/Intro.js';
import { Head } from '../components/SectionHead/Head.js';
import { AviationContext } from './AviationContext.js';
import { DataItems } from './DataItems.js';
import { MarketCard } from './MarketCard.js';
import { SourceList } from './SourceList.js';
import { classifyMarket } from '../utils/classifyMarket.js';
export function DataRoom({ visible, data, error }) {
  const [filter, setFilter] = useState('all'),
    [more, setMore] = useState(false);
  const markets = (data?.markets || [])
    .filter(x => filter === 'all' || classifyMarket(x.question) === filter)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));
  const selected = more ? markets : markets.slice(0, 9);
  return h(
    'div',
    { className: 'rw-page', hidden: !visible, id: 'data-room' },
    h(Intro, {
      kicker: 'REGIONAL WATCH · DATA ROOM',
      title: 'Данные',
      accent: 'и источники.',
      desc: 'Официальные сообщения, гражданская безопасность и рыночные ожидания. Отдельно от аналитической ленты.',
      meta: data
        ? 'D1 · обновлено ' + fmtTime(data.generatedAt) + ' · автообновление 2 минуты'
        : 'Получаем данные…',
    }),
    h(
      'section',
      { className: 'section' },
      h(Head, {
        title: 'Служба тыла · פיקוד העורף',
        sub: 'Гражданская безопасность и официальные уведомления',
      }),
      h(
        Card,
        null,
        t('span', 'notice', 'Прямая лента тревог пока не подключена'),
        t(
          'p',
          null,
          'У нас есть сообщения ЦАХАЛ, но нет независимого источника текущих тревог Командования тыла. Отсутствие сообщений здесь не означает отсутствия тревог.',
        ),
        h(
          'div',
          { className: 'links' },
          h(External, { url: 'https://www.oref.org.il/' }, 'Официальный сайт ↗'),
          h(External, { url: 'https://alerts-history.oref.org.il/' }, 'История тревог ↗'),
          h(External, { url: 'https://t.me/PikudHaOref_all' }, 'Telegram ↗'),
        ),
        t('h3', null, 'Последние сообщения ЦАХАЛ'),
        data ? h(DataItems, { items: data.home, kind: 'idf' }) : h(Loading),
      ),
    ),
    h(
      'section',
      { className: 'section', id: 'markets' },
      h(Head, {
        title: 'Polymarket · ожидания рынка',
        sub: 'Котировка YES, а не подтверждённая вероятность или разведданные',
        right: t('span', 'hint', markets.length + ' рынков'),
      }),
      h(
        'div',
        { className: 'filters' },
        ...[
          ['all', 'Все'],
          ['peace', 'Прекращение огня'],
          ['talks', 'Переговоры'],
          ['iran', 'Иран'],
        ].map(([id, label]) =>
          h(
            'button',
            {
              type: 'button',
              key: id,
              className: filter === id ? 'active' : '',
              onClick: () => {
                setFilter(id);
                setMore(false);
              },
            },
            label,
          ),
        ),
      ),
      error ? t('p', 'error', error) : null,
      data
        ? h('div', { className: 'data-grid' }, ...selected.map(m => h(MarketCard, { key: m.id, m })))
        : h(Loading),
      markets.length > 9
        ? h(
            'button',
            { className: 'more', type: 'button', onClick: () => setMore(!more) },
            more ? 'Свернуть' : 'Показать все (' + markets.length + ')',
          )
        : null,
      t(
        'p',
        'footnote',
        'Цены и объёмы сохранены в последнем снимке. Реальные условия расчёта исходов — на странице каждого рынка.',
      ),
    ),
    h(AviationContext, { data }),
    h(
      'section',
      { className: 'section' },
      h(Head, {
        title: 'Официальные источники',
        sub: 'Сообщения MARAD и CENTCOM / DVIDS из архива мониторинга',
      }),
      h(
        'div',
        { className: 'data-grid-2' },
        h(
          Card,
          null,
          t('h3', null, 'MARAD · море'),
          data ? h(DataItems, { items: data.marad, kind: 'marad' }) : h(Loading),
        ),
        h(
          Card,
          null,
          t('h3', null, 'CENTCOM / DVIDS'),
          data ? h(DataItems, { items: data.centcom, kind: 'centcom' }) : h(Loading),
        ),
      ),
    ),
    h(
      'section',
      { className: 'section', id: 'sources' },
      h(Head, { title: 'Все источники', sub: 'Последние результаты опросов — не оценки уровня угроз' }),
      h(
        Card,
        null,
        h(SourceList, { sources: data?.sources }),
        t('p', 'footnote', 'Микроскопические тайлы NASA не выводятся как полноценные спутниковые снимки.'),
      ),
    ),
    h(
      'div',
      { className: 'footer' },
      t('span', null, 'REGIONAL WATCH · Данные из открытых источников'),
      t('span', null, 'Официальные тревоги — только через Командование тыла'),
    ),
  );
}
