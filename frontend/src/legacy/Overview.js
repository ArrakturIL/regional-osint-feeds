import { fmtTime, h, simpleTime, t, useState } from '../app/runtime.js';
import { Card } from '../components/Card/Card.js';
import { Editorial } from '../components/Editorial/Editorial.js';
import { Loading } from '../components/Loading/Loading.js';
import { ActivityChips } from '../components/MonitorStatus/ActivityChips.js';
import { NewsMasonry } from '../components/NewsMasonry/NewsMasonry.js';
import { Intro } from '../components/PageIntro/Intro.js';
import { Head } from '../components/SectionHead/Head.js';
import { Summary } from '../components/Summary/Summary.js';
import { Events } from './Events.js';
import { SourceList } from './SourceList.js';
export function Overview({ visible, overview, news, live, errors, returning, previous }) {
  const [expandedId, setExpandedId] = useState(null);
  const [read, setRead] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rw-react-read-v1') || '{}');
    } catch {
      return {};
    }
  });
  const readIt = id => {
    const n = { ...read, [id]: Date.now() };
    setRead(n);
    try {
      localStorage.setItem(
        'rw-react-read-v1',
        JSON.stringify(
          Object.fromEntries(
            Object.entries(n)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 100),
          ),
        ),
      );
    } catch {}
  };
  const stories = news?.stories || [];
  return h(
    'div',
    { className: 'rw-page', hidden: !visible, id: 'overview' },
    h(Intro, {
      kicker: 'РЕГИОНАЛЬНЫЙ ОБЗОР / OPEN SOURCE INTELLIGENCE',
      title: 'Обстановка',
      accent: 'в регионе.',
      desc: 'Подтверждённые события, аналитические выводы и состояние источников. Без информационного шума.',
      stamp: {
        label: 'ПОСЛЕДНИЙ АНАЛИЗ',
        main: simpleTime(overview?.analysis?.time),
        sub: fmtTime(overview?.analysis?.time) + ' · Израиль',
      },
    }),
    returning && previous && news
      ? h(
          'section',
          { className: 'return' },
          t('h3', null, 'Пока тебя не было'),
          h(
            'div',
            { className: 'return-items' },
            h(
              'span',
              null,
              t('b', null, stories.filter(x => Date.parse(x.discoveredAt) > previous).length),
              ' новых публикаций',
            ),
            h(
              'span',
              null,
              t('b', null, overview?.events?.filter(x => Date.parse(x.date) > previous).length || 0),
              ' обновлений событий',
            ),
          ),
        )
      : null,
    h(ActivityChips, { overview }),
    h(Summary, { overview }),
    h(Editorial, { notes: news?.editorials }),
    h(
      'section',
      { className: 'section', id: 'on-air' },
      h(Head, {
        title: 'В эфире',
        sub: 'Самые заметные публикации и короткие редакционные комментарии',
        right: t(
          'span',
          'hint',
          news?.checkedAt
            ? 'RSS 5 мин · ' + (news.newLastSixHours || 0) + ' за 6 ч · опрос ' + simpleTime(news.checkedAt)
            : 'Ожидаем ленту',
        ),
      }),
      errors?.news ? t('p', 'error', 'Не удалось обновить новости: ' + errors.news) : null,
      news
        ? h(NewsMasonry, { stories, expandedId, onToggle: setExpandedId, read, markRead: readIt })
        : h(Loading, { label: 'Получаем новости…' }),
      t(
        'p',
        'footnote',
        'Комментарии Cloudflare AI отделены от сообщений источников. «Реплика редактора» публикуется отдельно в авторской колонке.',
      ),
    ),
    h(
      'section',
      { className: 'section' },
      h(
        'div',
        { className: 'events-layout' },
        h(
          Card,
          null,
          h(Head, { title: 'Последние события', sub: 'Из журнала мониторинга и последнего анализа' }),
          overview ? h(Events, { items: overview.events }) : h(Loading),
        ),
        h(
          Card,
          { id: 'sources' },
          h(Head, { title: 'Состояние системы', sub: 'Результаты последних опросов источников' }),
          t('h2', null, overview ? overview.available + '/' + overview.total : '—'),
          t('p', 'hint', 'Источников отвечают без ошибок'),
          h(SourceList, { sources: overview?.sources }),
          h(
            'details',
            null,
            h('summary', null, 'Технический журнал опросов'),
            h(
              'div',
              { className: 'tech-log' },
              ...(live?.activity || []).map((v, i) =>
                h(
                  'div',
                  { className: 'sources-row', key: i },
                  t('span', null, v.label || 'Источник'),
                  t('span', 'right', v.message || ''),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    h(
      'div',
      { className: 'footer' },
      t('span', null, 'REGIONAL WATCH · Публичный информационный обзор'),
      t('span', null, 'Обновление данных без перезагрузки'),
    ),
  );
}
