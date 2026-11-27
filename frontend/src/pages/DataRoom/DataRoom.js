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
// UCDP (Uppsala Conflict Data Program): organised-violence events and deaths
// by region and month. Weeks behind real time — background, not the current
// picture. Collapsed by default with a warning: the content is casualty counts.
const UCDP_L = UI_HE
  ? {
      nav: 'אלימות מאורגנת',
      title: 'אלימות מאורגנת: אירועים והרוגים',
      sub: 'נתוני UCDP (אוניברסיטת אופסלה) בפיגור של כחודש. זה רקע, לא התמונה הנוכחית.',
      open: 'להצגת הנתונים',
      warn: 'בפנים — מספרי הרוגים לפי אזורים.',
      regions: {
        israel: 'ישראל, עזה והגדה המערבית',
        lebanon_syria: 'לבנון וסוריה',
        iran: 'איראן',
        gulf: 'מדינות המפרץ',
        red_sea: 'תימן',
        iraq: 'עיראק',
      },
      line: (e, d, c) => e + ' אירועים, ' + d + ' הרוגים' + (c ? ' (מהם ' + c + ' אזרחים)' : ''),
      region: 'אזור',
      caption: 'הרוגים לפי חודש ואזור',
      ev: e => e + ' אירועים',
      civ: c => c + ' אזרחים',
      legend: 'המספר הגדול — הרוגים (ההערכה המרכזית של UCDP); מתחתיו — אירועים ואזרחים. גוון הרקע — גודל יחסי בטבלה.',
      unknown: 'צד לא מזוהה',
      latest: 'אירועים אחרונים בנתונים',
      deaths: d => d + ' הרוגים',
      note: 'נספרים אירועי אלימות מאורגנת עם הרוג אחד לפחות. ',
      release: 'גרסה ',
    }
  : {
      nav: 'Вооружённое насилие',
      title: 'Вооружённое насилие: события и погибшие',
      sub: 'Данные UCDP (Уппсальский университет) с отставанием около месяца. Это фон, а не текущая обстановка.',
      open: 'Показать данные',
      warn: 'Внутри — число погибших по регионам.',
      regions: {
        israel: 'Израиль, Газа и Западный берег',
        lebanon_syria: 'Ливан и Сирия',
        iran: 'Иран',
        gulf: 'Страны Залива',
        red_sea: 'Йемен',
        iraq: 'Ирак',
      },
      line: (e, d, c) =>
        e +
        ' ' +
        ruPlural(e, ['событие', 'события', 'событий']) +
        ', ' +
        d +
        ' ' +
        ruPlural(d, ['погибший', 'погибших', 'погибших']) +
        (c ? ' (из них мирных — ' + c + ')' : ''),
      region: 'Регион',
      caption: 'Погибшие по месяцам и регионам',
      ev: e => e + ' ' + ruPlural(e, ['событие', 'события', 'событий']),
      civ: c => 'мирных ' + c,
      legend:
        'Крупное число — погибшие (основная оценка UCDP), под ним — события и мирные жители. Оттенок — относительная величина в таблице.',
      unknown: 'неустановленная сторона',
      latest: 'Последние события в данных',
      deaths: d => d + ' ' + ruPlural(d, ['погибший', 'погибших', 'погибших']),
      note: 'Считаются события организованного насилия хотя бы с одним погибшим. ',
      release: 'Выпуск ',
    };
const ucdpMonth = (m, month = 'long') => {
  const d = new Date(m + '-15T00:00:00Z');
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(UI_HE ? 'he-IL' : 'ru-RU', { month, timeZone: 'UTC' }).replace(/\.$/, '')
    : m;
};
// UCDP marks actors it has not identified as «XXX123»: say so in words.
const ucdpSides = (s, unknown) => String(s || '').replace(/\bXXX\d+\b/g, unknown);
// 27.11 owner: a real table — regions by the last four months, deaths first.
export function ucdpTable(regions) {
  const months = [...new Set(regions.flatMap(r => (r.months || []).map(m => m.month)))]
    .sort()
    .reverse()
    .slice(0, 4);
  const max = Math.max(1, ...regions.flatMap(r => (r.months || []).map(m => m.deaths || 0)));
  return {
    months,
    rows: regions.map(r => ({
      id: r.id,
      cells: months.map(month => (r.months || []).find(m => m.month === month) || null),
    })),
    heat: d => Math.round((Math.sqrt((d || 0) / max) * 0.34 + (d ? 0.04 : 0)) * 100) / 100,
  };
}
export function UcdpSection({ ucdp }) {
  if (!ucdp || !Array.isArray(ucdp.regions)) return null;
  const L = UCDP_L;
  return h(
    'section',
    { className: 'section', id: 'conflict' },
    h(Head, { title: L.title, icon: 'activity', sub: L.sub }),
    h(
      Card,
      null,
      h(
        'details',
        { className: 'rw-technical-details rw-ucdp' },
        h('summary', null, t('strong', null, L.open), ' ', t('span', 'rw-ucdp-warn', L.warn)),
        (() => {
          const T = ucdpTable(ucdp.regions);
          return h(
            'div',
            { className: 'rw-ucdp-scroll', tabIndex: 0, role: 'region', 'aria-label': L.caption },
            h(
              'table',
              { className: 'rw-ucdp-table' },
              t('caption', 'rw-visually-hidden', L.caption),
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  h('th', { scope: 'col' }, L.region),
                  ...T.months.map(m => h('th', { scope: 'col', key: m }, ucdpMonth(m, 'short'))),
                ),
              ),
              h(
                'tbody',
                null,
                ...T.rows.map(r =>
                  h(
                    'tr',
                    { key: r.id },
                    h('th', { scope: 'row' }, L.regions[r.id] || r.id),
                    ...r.cells.map((c, i) =>
                      h(
                        'td',
                        { key: i, style: c ? { '--rw-ucdp-heat': T.heat(c.deaths) } : undefined },
                        c ? t('strong', null, String(c.deaths)) : t('span', 'rw-ucdp-empty', '—'),
                        c ? t('small', null, L.ev(c.events)) : null,
                        c && c.civilians ? t('small', null, L.civ(c.civilians)) : null,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            t('p', 'rw-ucdp-legend', L.legend),
          );
        })(),
        ucdp.latest?.length
          ? h(
              'div',
              { className: 'rw-ucdp-latest' },
              t('h4', null, L.latest),
              h(
                'ol',
                null,
                ...ucdp.latest.map((e, i) =>
                  h(
                    'li',
                    { key: i },
                    h(
                      'span',
                      { className: 'rw-ucdp-event' },
                      t('small', null, e.date + (e.region ? ' · ' + (L.regions[e.region] || '') : '')),
                      h('span', { className: 'rw-ucdp-where', dir: 'auto' }, e.where),
                      e.sides ? h('small', { className: 'rw-ucdp-sides', dir: 'auto' }, ucdpSides(e.sides, L.unknown)) : null,
                    ),
                    t('strong', 'rw-ucdp-deaths', L.deaths(e.deaths)),
                  ),
                ),
              ),
            )
          : null,
        h(
          'p',
          { className: 'rw-fineprint' },
          L.note,
          'UCDP GED Candidate' + (ucdp.version ? ', ' + L.release + ucdp.version : '') + ' · ',
          h(External, { url: 'https://ucdp.uu.se/' }, 'ucdp.uu.se'),
        ),
      ),
    ),
  );
}

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
          'מדידות בלבד: פעילות חריגה לפי אזורים ואותות, ציפיות השוק, תעופה ולוויינים, ומגבלות הניטור. הודעות רשמיות — בעמוד העדכונים.',
        nav: 'חלקי הנתונים',
        index: 'פעילות חריגה',
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
        intro: 'Только измерения: необычная активность по регионам и сигналам, ожидания рынка, авиация и спутники, ограничения мониторинга. Официальные сообщения — в «Ленте».',
        nav: 'Разделы данных',
        index: 'Необычная активность',
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
        ...(data?.ucdp ? [['#conflict', UCDP_L.nav]] : []),
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
    h(UcdpSection, { ucdp: data?.ucdp }),
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
