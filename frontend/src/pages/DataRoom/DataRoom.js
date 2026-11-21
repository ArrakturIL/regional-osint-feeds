import { FeedState } from '../../components/FeedState/FeedState.js';
import { UI_HE, fmtTime, h, t, useState } from '../../app/runtime.js';
import { AviationExplainedV2 } from '../../components/Aviation/AviationExplained.js';
import { Card } from '../../components/Card/Card.js';
import { TensionDetail } from '../../components/Tension/Tension.js';
import { External } from '../../components/External/External.js';
import { Intro } from '../../components/PageIntro/Intro.js';
import { SatelliteCatalog } from '../../components/SatelliteCatalog/SatelliteCatalog.js';
import { Head } from '../../components/SectionHead/Head.js';
import { classifyMarket } from '../../utils/classifyMarket.js';
import { MarketSeriesCard } from '../../components/MarketCard/MarketSeriesCard.js';
import { rwMarketSeries } from '../../utils/marketSeries.js';
import { ruPlural } from '../../utils/ruPlural.js';
export function DataRoomV2({
  visible,
  data,
  error,
  feed,
  aviation,
  satellite,
  aviationError,
  satelliteError,
  aviationPending,
  satellitePending,
  tension,
}) {
  const [filter, setFilter] = useState('all'),
    [showAll, setShowAll] = useState(false),
    isHe = UI_HE;
  const L = isHe
    ? {
        kicker: 'מודיעין ממקורות גלויים / נתונים ומקורות',
        title: 'נתונים',
        accent: 'ומקורות',
        intro:
          'מדידות בלבד: מדד המתיחות לפי אזורים ואותות, ציפיות השוק, תעופה ולוויינים, ומגבלות הניטור. הודעות רשמיות — בעמוד העדכונים.',
        nav: 'חלקי הנתונים',
        index: 'מדד המתיחות',
        markets: 'ציפיות השוק',
        diagnostics: 'שיטת העבודה',
        marketsTitle: 'Polymarket: ציפיות המשתתפים',
        marketSub:
          'האחוזים הם מחיר חוזה ה״כן״ ב־Polymarket: כך משתתפי השוק מעריכים את הסיכוי. זו אינה תחזית של המערכת ואינה אישור שהאירוע יתרחש.',
        marketAll: 'הכול',
        marketPeace: 'הפסקת אש',
        marketTalks: 'משא ומתן',
        marketIran: 'איראן',
        more: 'הצגת שאר השווקים',
        less: 'הצגת פחות',
        noMarket: 'אין שווקים זמינים כרגע.',
        aviation: 'תעופה והודעות רשמיות',
        satellite: 'מידע לווייני',
        meaningful: 'מוצגים רק ממצאים שעברו סינון ואישור לפרסום.',
        emptyTelemetry: 'אין כעת נתונים מתורגמים בעלי משמעות לפרסום.',
        issues: (n, all) => 'מקורות עם תקלה: ' + n + ' מתוך ' + all,
        sourceState: 'מצב מקורות הנתונים',
        sourceUnknown: 'סטטוס לא ידוע',
        sourceDisabled: 'מושבת זמנית',
        sourceOk: 'תקין',
        sourcePartial: 'חלקי',
        sourceError: 'שגיאה',
        sourceEmpty: 'אין רשומות',
        method: 'מתודולוגיה ומגבלות הניטור',
        methodSub: 'מה עשוי להגביל את המסקנות?',
        methodInfo:
          'היעדר אות, דיווח או מסלול טיסה אינו מוכיח שהאירוע לא התרחש. מידע חלקי אינו שווה למידע שגוי.',
        noData: 'טרם התקבלו נתונים. נסה לרענן.',
        publish: 'פורסם: ',
      }
    : {
        kicker: 'ИССЛЕДОВАТЕЛЬСКИЙ УРОВЕНЬ / ОТКРЫТЫЕ ДАННЫЕ',
        title: 'Данные',
        accent: 'и источники',
        intro: 'Только измерения: индекс напряжённости по регионам и сигналам, ожидания рынка, авиация и спутники, ограничения мониторинга. Официальные сообщения — в «Ленте».',
        nav: 'Разделы данных',
        index: 'Индекс напряжённости',
        markets: 'Ожидания рынка',
        diagnostics: 'Методология',
        marketsTitle: 'Polymarket: ожидания участников рынка',
        marketSub:
          'Проценты — цена контракта «Да» на Polymarket: так участники рынка оценивают шансы. Это не прогноз редакции и не подтверждение события.',
        marketAll: 'Все',
        marketPeace: 'Прекращение огня',
        marketTalks: 'Переговоры',
        marketIran: 'Иран',
        more: 'Показать остальные',
        less: 'Свернуть',
        noMarket: 'Нет актуальных рынков.',
        aviation: 'Авиация и официальные сообщения',
        satellite: 'Спутниковые данные',
        meaningful: 'Показываются только сведения, разрешённые к публикации.',
        emptyTelemetry: 'Нет содержательных записей, подходящих для публикации.',
        issues: (n, all) => 'С перебоями: ' + n + ' из ' + all,
        sourceState: 'Состояние источников данных',
        sourceUnknown: 'Статус неизвестен',
        sourceDisabled: 'Временно отключён',
        sourceOk: 'Работает',
        sourcePartial: 'Частично',
        sourceError: 'Ошибка',
        sourceEmpty: 'Нет записей',
        method: 'Методология и ограничения мониторинга',
        methodSub: 'Что ограничивает выводы?',
        methodInfo:
          'Отсутствие сигнала, записи или воздушного трека не означает отсутствия реального события. Неполные сведения не доказывают обратное.',
        noData: 'Данные пока недоступны, попробуй обновить страницу.',
        publish: 'Опубликовано: ',
      };
  const allMarkets = Array.isArray(data?.markets) ? data.markets : [],
    markets = allMarkets
      .filter(x => filter === 'all' || classifyMarket(x.question) === filter)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0)),
    marketCards = rwMarketSeries(markets),
    selected = showAll ? marketCards : marketCards.slice(0, 6);
  const allSources = Array.isArray(data?.sources) ? data.sources : [],
    issues = allSources.filter(x => x.state === 'error' || x.state === 'partial');
  const heReady = v => {
    const rows = Array.isArray(v?.items) ? v.items : Array.isArray(v?.signals) ? v.signals : [];
    if (v?.display_policy !== 'show' || v?.has_publishable_content === false) return [];
    return rows.filter(
      x =>
        x.content_language === 'he' &&
        ['available', 'ready', 'localized_template'].includes(x.translation_status) &&
        /[\u0590-\u05ff]/u.test(x.title || '') &&
        /[\u0590-\u05ff]/u.test(x.description || ''),
    );
  };
  const panelNotice = (key, label, record, err, waiting) => {
    const he = UI_HE;
    if (err)
      return h(
        'p',
        { className: 'error rw-osint-panel-error', role: 'alert', 'data-source': key },
        (he ? 'מקור המידע ' : 'Источник данных «') +
          label +
          (he
            ? ' אינו זמין כעת. החלקים האחרים ממשיכים לפעול.'
            : '» временно недоступен. Остальные источники продолжают работать.'),
      );
    if (waiting && !record)
      return h(
        'p',
        { className: 'rw-osint-panel-pending', 'data-source': key, role: 'status' },
        he ? 'בודקים את זמינות הנתונים…' : 'Проверяем доступность источника…',
      );
    if (record?.display_policy === 'pending')
      return h(
        'p',
        { className: 'rw-osint-panel-pending', 'data-source': key, role: 'status' },
        he ? 'המידע עדיין בבדיקה.' : 'Информация ещё проходит проверку.',
      );
    if (record?.display_policy === 'empty')
      return h(
        'p',
        { className: 'rw-osint-panel-pending', 'data-source': key, role: 'status' },
        he
          ? 'המקור זמין, אך אין פריטים לפרסום.'
          : 'Источник доступен, но подходящих для публикации записей нет.',
      );
    return null;
  };
  const localized = (name, v) => {
    if (!v || v.display_policy === 'hide' || v.has_publishable_content === false) return null;
    const rows = heReady(v);
    return h(
      'section',
      { className: 'section' },
      h(Head, { title: name, icon: 'activity', sub: L.meaningful }),
      rows.length
        ? h(
            'div',
            { className: 'rw-he-grid' },
            ...rows
              .slice(0, 8)
              .map(x =>
                h(
                  'article',
                  { className: 'rw-he-article', key: x.id },
                  t('h3', null, x.title),
                  t('p', null, x.description),
                  x.source?.url ? h(External, { url: x.source.url }, 'למקור ↗') : null,
                ),
              ),
          )
        : t('p', 'hint', L.emptyTelemetry),
    );
  };
  return h(
    'div',
    { className: 'rw-page', hidden: !visible, id: 'data-room' },
    h(Intro, {
      kicker: L.kicker,
      title: L.title,
      accent: L.accent,
      desc: L.intro,
      meta: data ? L.publish + fmtTime(data.generatedAt) : null,
    }),
    h(
      'nav',
      { className: 'rw-data-nav', 'aria-label': L.nav },
      ...[
        ['#index', L.index],
        ['#markets', L.markets],
        ['#diagnostics', L.diagnostics],
      ].map(([href, label]) => h('a', { href, key: href }, label)),
    ),
    error ? h(FeedState, { feed }) : null,
    h(TensionDetail, { tension }),
    h(
      'section',
      { className: 'section', id: 'markets' },
      h(Head, {
        title: L.marketsTitle,
        icon: 'database',
        sub: L.marketSub,
        right: t(
          'span',
          'hint',
          allMarkets.length +
            ' ' +
            (isHe ? 'שווקים' : ruPlural(allMarkets.length, ['рынок', 'рынка', 'рынков'])),
        ),
      }),
      h(
        'div',
        { className: 'filters' },
        ...[
          ['all', L.marketAll],
          ['peace', L.marketPeace],
          ['talks', L.marketTalks],
          ['iran', L.marketIran],
        ].map(([id, label]) =>
          h(
            'button',
            {
              type: 'button',
              key: id,
              'aria-pressed': filter === id,
              className: filter === id ? 'active' : '',
              onClick: () => {
                setFilter(id);
                setShowAll(false);
              },
            },
            label,
          ),
        ),
      ),
      markets.length
        ? h(
            'div',
            { className: 'data-grid' },
            ...selected.map(series => h(MarketSeriesCard, { key: series.key, series, he: isHe })),
          )
        : t('p', 'hint', L.noMarket),
      marketCards.length > 6
        ? h(
            'button',
            { type: 'button', className: 'more', onClick: () => setShowAll(!showAll) },
            showAll ? L.less : L.more + ' (' + (marketCards.length - 6) + ')',
          )
        : null,
    ),
    panelNotice('aviation', L.aviation, aviation, aviationError, aviationPending),
    isHe ? localized(L.aviation, aviation) : h(AviationExplainedV2, { data }),
    panelNotice('satellite', L.satellite, satellite, satelliteError, satellitePending),
    isHe ? localized(L.satellite, satellite) : h(SatelliteCatalog, { data }),
    h(
      'section',
      { className: 'section', id: 'diagnostics' },
      h(Head, { title: L.method, icon: 'database', sub: L.methodSub }),
      h(
        Card,
        null,
        t('h3', null, L.sourceState),
        t('p', null, L.issues(issues.length, allSources.length)),
        h(
          'details',
          { className: 'rw-technical-details' },
          h('summary', null, L.sourceState),
          ...allSources.map(s =>
            h(
              'div',
              { className: 'sources-row', key: s.id },
              t('span', null, (UI_HE ? s.label_he : s.label) || s.id),
              t(
                'span',
                null,
                s.state === 'ok'
                  ? L.sourceOk
                  : s.state === 'partial'
                    ? L.sourcePartial
                    : s.state === 'error'
                      ? L.sourceError
                      : s.state === 'empty'
                        ? L.sourceEmpty
                        : s.state === 'disabled'
                          ? L.sourceDisabled
                          : L.sourceUnknown,
              ),
            ),
          ),
        ),
        t('p', 'rw-fineprint', L.methodInfo),
        // Providers whose terms require a citation with a link (adsb.fi, AvioADSB).
        (() => {
          const seen = new Map();
          for (const s of allSources) for (const a of s.attribution || []) seen.set(a.name, a.url);
          return seen.size
            ? h(
                'p',
                { className: 'rw-fineprint' },
                isHe ? 'נתוני ADS-B: ' : 'Данные ADS-B: ',
                ...[...seen]
                  .flatMap(([name, url], i) => [i ? ' · ' : null, h(External, { url, key: name }, name)])
                  .filter(Boolean),
              )
            : null;
        })(),
      ),
    ),
  );
}
