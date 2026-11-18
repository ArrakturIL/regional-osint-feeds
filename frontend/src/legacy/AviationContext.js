import { fmtTime, h, t } from '../app/runtime.js';
import { Card } from '../components/Card/Card.js';
import { External } from '../components/External/External.js';
import { Head } from '../components/SectionHead/Head.js';
import { SourceDot } from '../components/SourceStatus/SourceDot.js';
export function AviationContext({ data }) {
  const a = data?.airbridge;
  const samples = data?.aviationSamples || [];
  const limits = data?.providerLimits || [];
  const areas = {
    north_america_east: 'Восток Северной Америки',
    tehran: 'Тегеран',
    gulf_of_oman: 'Оманский залив',
    eastern_iran: 'Восточный Иран',
    western_iran: 'Западный Иран',
    persian_gulf: 'Персидский залив',
    israel_jordan: 'Израиль и Иордания',
    red_sea: 'Красное море',
  };
  const area = x => areas[x] || String(x || 'Район не указан').replace(/_/g, ' ');
  const count = x => (Number.isFinite(Number(x)) ? Number(x).toLocaleString('ru-RU') : '—');
  return h(
    'section',
    { className: 'section', id: 'aviation' },
    h(Head, {
      title: 'Авиационный контекст',
      sub: 'Новые данные бэкенда · AvioADSB, воздушная логистика и ограничения доступа',
    }),
    h(
      'div',
      { className: 'data-grid-2' },
      h(
        Card,
        { className: 'aviation-panel' },
        t('div', 'kicker', 'ТРАНСПОРТНАЯ АВИАЦИЯ · РАЗОВЫЙ СРЕЗ'),
        t('h3', null, a ? area(a.area) : 'Данные ожидаются'),
        a
          ? h(
              'div',
              null,
              h(
                'div',
                { className: 'aviation-metrics' },
                h('div', null, t('b', null, count(a.observed)), t('small', null, 'Всего бортов в выборке')),
                h(
                  'div',
                  null,
                  t('b', null, count(a.airlift)),
                  t('small', null, 'Бортов логистических типов'),
                ),
                h(
                  'div',
                  null,
                  t('b', null, count(a.tankers)),
                  t('small', null, 'Самолётов заправочного типа'),
                ),
              ),
              h(
                'p',
                { className: 'aviation-info' },
                'Отмеченные типы: ' +
                  (Object.entries(a.logisticsTypes || {})
                    .map(([name, n]) => name + ' — ' + n)
                    .join(', ') || 'нет данных') +
                  '; флаги военной базы: ' +
                  count(a.militaryFlagged) +
                  '.',
              ),
              t(
                'p',
                'footnote',
                'Снимок ' +
                  fmtTime(a.time) +
                  ' · радиус ' +
                  count(a.radiusNm) +
                  ' морских миль. Это одна точка наблюдения: принадлежность самолётов, маршрут и назначение груза не установлены.',
              ),
              h(External, { url: a.link }, 'Данные AvioADSB ↗'),
            )
          : t('p', 'footnote', 'Пока нет снимка воздушной логистики. Это не означает отсутствия полётов.'),
      ),
      h(
        Card,
        { className: 'aviation-panel' },
        t('div', 'kicker', 'РЕГИОНАЛЬНЫЕ ВЫБОРКИ'),
        t('h3', null, 'Последние авиационные снимки'),
        samples.length
          ? h(
              'div',
              { className: 'aviation-samples' },
              ...samples.map(x =>
                h(
                  'div',
                  { className: 'aviation-sample', key: x.area },
                  h('div', null, t('strong', null, area(x.area)), t('small', null, fmtTime(x.time))),
                  h(
                    'div',
                    { className: 'aviation-sample-right' },
                    t('b', null, count(x.observed)),
                    t('small', null, x.coverageLimited ? 'Ограниченный радиус' : 'Неполное покрытие'),
                  ),
                ),
              ),
            )
          : t('p', 'footnote', 'Региональных выборок в базе пока нет.'),
        t(
          'p',
          'footnote',
          'Ноль означает отсутствие бортов в конкретной выборке приёмников, а не пустое воздушное пространство.',
        ),
      ),
    ),
    limits.length
      ? h(
          Card,
          { className: 'aviation-quota' },
          h(
            'div',
            { className: 'panel-header' },
            t('span', 'panel-title', 'Доступность авиационных источников'),
            t('span', 'hint', 'Квоты и паузы · данные бэкенда'),
          ),
          h(
            'div',
            { className: 'provider-grid' },
            ...limits.map(p =>
              h(
                'div',
                { className: 'provider-item', key: p.provider },
                h(
                  'div',
                  { className: 'provider-head' },
                  t(
                    'strong',
                    null,
                    p.provider === 'adsb.lol'
                      ? 'ADS-B.lol'
                      : p.provider === 'avioadsb.org'
                        ? 'AvioADSB'
                        : p.provider,
                  ),
                  h(SourceDot, { state: p.paused ? 'error' : 'ok' }),
                ),
                t('p', null, p.paused ? 'Временная пауза из-за ограничения API' : 'Подключение активно'),
                p.remaining === null
                  ? null
                  : t(
                      'small',
                      null,
                      'Осталось запросов: ' + count(p.remaining) + ' · сброс: ' + fmtTime(p.resetAt),
                    ),
                p.paused ? t('small', null, 'Следующая попытка не раньше ' + fmtTime(p.nextAllowedAt)) : null,
                p.lastStatus ? t('small', null, 'Последний HTTP-статус: ' + p.lastStatus) : null,
              ),
            ),
          ),
          t(
            'p',
            'footnote',
            'Пауза после ошибки 429 — защита от исчерпания квоты. Она не означает отключения всего мониторинга.',
          ),
        )
      : null,
  );
}
