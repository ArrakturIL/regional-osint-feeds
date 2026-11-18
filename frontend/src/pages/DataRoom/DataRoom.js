import { FeedState } from '../../components/FeedState/FeedState.js';
import { UI_HE, fmtTime, h, t, useState } from '../../app/runtime.js';
import { AviationExplainedV2 } from '../../components/Aviation/AviationExplained.js';
import { Card } from '../../components/Card/Card.js';
import { External } from '../../components/External/External.js';
import { Intro } from '../../components/PageIntro/Intro.js';
import { SatelliteCatalog } from '../../components/SatelliteCatalog/SatelliteCatalog.js';
import { Head } from '../../components/SectionHead/Head.js';
import { classifyMarket } from '../../utils/classifyMarket.js';
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
}) {
  const [filter, setFilter] = useState('all'),
    [showAll, setShowAll] = useState(false),
    isHe = UI_HE;
  const L = isHe
    ? {
        kicker: 'מודיעין ממקורות גלויים / נתונים ומקורות',
        title: 'נתונים',
        accent: 'ומקורות.',
        intro:
          'מקורות ראשוניים, עדכונים רשמיים, מעקב אחר שווקים ומגבלות המידע. מידע גולמי מוסתר כאשר אינו ראוי לפרסום.',
        nav: 'חלקי הנתונים',
        civil: 'ביטחון אזרחי',
        markets: 'ציפיות השוק',
        official: 'פרסומים רשמיים',
        diagnostics: 'שיטת העבודה',
        safety: 'פיקוד העורף וביטחון אזרחי',
        safetySub: 'הודעות רשמיות לפני כל הערכה',
        noAlerts: 'אין במערכת חיבור ישיר להתרעות בזמן אמת.',
        oref: 'פיקוד העורף',
        history: 'היסטוריית התרעות',
        officialNotices: 'הודעות רשמיות',
        idf: 'הודעות צה״ל האחרונות',
        marketsTitle: 'Polymarket: ציפיות המשתתפים',
        marketSub: 'המחיר משקף מסחר בשוק ולא מוכיח שאירוע עתידי יתרחש.',
        marketOriginal: 'כותרת המקור (אנגלית)',
        marketAll: 'הכול',
        marketPeace: 'הפסקת אש',
        marketTalks: 'משא ומתן',
        marketIran: 'איראן',
        more: 'הצגת שאר השווקים',
        less: 'הצגת פחות',
        noMarket: 'אין שווקים זמינים כרגע.',
        yes: 'מחיר YES',
        volume: 'נפח מסחר',
        aviation: 'תעופה והודעות רשמיות',
        satellite: 'מידע לווייני',
        meaningful: 'מוצגים רק ממצאים שעברו סינון ואישור לפרסום.',
        emptyTelemetry: 'אין כעת נתונים מתורגמים בעלי משמעות לפרסום.',
        officialData: 'ים ופרסומים רשמיים',
        marad: 'MARAD — אזהרות ימיות',
        centcom: 'CENTCOM / DVIDS',
        origin: 'כותרות המקור מוצגות כפי שפורסמו.',
        sources: 'מקורות',
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
        accent: 'и источники.',
        intro: 'Проверка первоисточников, официальные публикации, ожидания рынка и ограничения мониторинга.',
        nav: 'Разделы данных',
        civil: 'Гражданская безопасность',
        markets: 'Ожидания рынка',
        official: 'Официальные источники',
        diagnostics: 'Методология',
        safety: 'Служба тыла и гражданская безопасность',
        safetySub: 'Официальные источники прежде любых оценок',
        noAlerts: 'Прямое получение действующих тревог не подключено.',
        oref: 'Служба тыла',
        history: 'История предупреждений',
        officialNotices: 'Официальные сообщения',
        idf: 'Последние публикации ЦАХАЛ',
        marketsTitle: 'Polymarket: ожидания участников рынка',
        marketSub: 'Цена YES — рыночная котировка, а не подтверждение будущего события.',
        marketOriginal: 'Название рынка (оригинал)',
        marketAll: 'Все',
        marketPeace: 'Прекращение огня',
        marketTalks: 'Переговоры',
        marketIran: 'Иран',
        more: 'Показать остальные',
        less: 'Свернуть',
        noMarket: 'Нет актуальных рынков.',
        yes: 'Цена YES',
        volume: 'Объём',
        aviation: 'Авиация и официальные сообщения',
        satellite: 'Спутниковые данные',
        meaningful: 'Показываются только сведения, разрешённые к публикации.',
        emptyTelemetry: 'Нет содержательных записей, подходящих для публикации.',
        officialData: 'Море и официальные публикации',
        marad: 'MARAD — морские предупреждения',
        centcom: 'CENTCOM / DVIDS',
        origin: 'Заголовки источников приведены в оригинале.',
        sources: 'Источники',
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
    selected = showAll ? markets : markets.slice(0, 6);
  const allSources = Array.isArray(data?.sources) ? data.sources : [],
    issues = allSources.filter(x => x.state === 'error' || x.state === 'partial');
  const official = (name, items) =>
    h(
      Card,
      null,
      h('h3', null, name),
      Array.isArray(items) && items.length
        ? h(
            'div',
            { className: 'rw-data-official-list' },
            ...items.slice(0, 5).map((x, i) => {
              const language = x.content_language || 'en',
                idfofficial = /^https:\/\/t\.me\/idfofficial\//.test(String(x.url || '')),
                pending = idfofficial && language !== (isHe ? 'he' : 'ru');
              return h(
                'article',
                { className: 'rw-official-row', key: x.id || i },
                h('strong', { lang: language, dir: 'auto' }, x.title || name),
                pending
                  ? h(
                      'small',
                      { className: 'rw-translation-state', role: 'status' },
                      isHe
                        ? language === 'en'
                          ? 'המקור באנגלית · התרגום ממתין'
                          : 'המקור ברוסית · התרגום ממתין'
                        : language === 'en'
                          ? 'Оригинал на английском · перевод ожидается'
                          : 'Оригинал на иврите · перевод ожидается',
                    )
                  : null,
                idfofficial && x.translation_status === 'available'
                  ? h(
                      'small',
                      { className: 'rw-translation-state' },
                      isHe
                        ? 'תרגום מכונה · יש לבדוק מול המקור'
                        : 'Автоматический перевод · сверяй с оригиналом',
                    )
                  : null,
                x.published ? t('small', 'hint', L.publish + fmtTime(x.published)) : null,
                x.description ? h('p', { lang: language, dir: 'auto' }, x.description) : null,
                x.url ? h(External, { url: x.url }, isHe ? 'למקור ↗' : 'Первоисточник ↗') : null,
              );
            }),
          )
        : t('p', 'hint', L.emptyTelemetry),
    );
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
        ['#civil', L.civil],
        ['#markets', L.markets],
        ['#official', L.official],
        ['#diagnostics', L.diagnostics],
      ].map(([href, label]) => h('a', { href, key: href }, label)),
    ),
    error ? h(FeedState, { feed }) : null,
    h(
      'section',
      { className: 'section', id: 'civil' },
      h(Head, { title: L.safety, icon: 'activity', sub: L.safetySub }),
      h(
        Card,
        null,
        t('span', 'notice', L.noAlerts),
        h(
          'div',
          { className: 'links' },
          h(External, { url: 'https://www.oref.org.il/' }, L.oref + ' ↗'),
          h(External, { url: 'https://alerts-history.oref.org.il/' }, L.history + ' ↗'),
          h(External, { url: 'https://t.me/PikudHaOref_all' }, L.officialNotices + ' ↗'),
        ),
        t('h3', null, L.idf),
        Array.isArray(data?.home) && data.home.length
          ? official(L.idf, data.home)
          : t('p', 'hint', L.emptyTelemetry),
      ),
    ),
    h(
      'section',
      { className: 'section', id: 'markets' },
      h(Head, {
        title: L.marketsTitle,
        icon: 'database',
        sub: L.marketSub,
        right: t('span', 'hint', allMarkets.length + ' Polymarket'),
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
            ...selected.map(m =>
              h(
                'article',
                { className: 'market', key: m.id },
                t('span', 'kicker', L.marketOriginal),
                h('h3', { lang: 'en', dir: 'auto' }, m.question),
                h(
                  'div',
                  { className: 'rw-market-metrics' },
                  t(
                    'strong',
                    null,
                    L.yes +
                      ': ' +
                      (Number.isFinite(Number(m.yes)) ? (Number(m.yes) * 100).toFixed(1) + '%' : '—'),
                  ),
                  h(
                    'div',
                    {
                      className: 'bar rw-market-yes-bar',
                      role: 'progressbar',
                      'aria-label': L.yes,
                      'aria-valuemin': 0,
                      'aria-valuemax': 100,
                      'aria-valuenow': Number.isFinite(Number(m.yes))
                        ? Math.max(0, Math.min(100, Math.round(Number(m.yes) * 1000) / 10))
                        : undefined,
                    },
                    h('i', { style: { width: Math.max(0, Math.min(100, Number(m.yes || 0) * 100)) + '%' } }),
                  ),
                  t(
                    'span',
                    null,
                    L.volume +
                      ': ' +
                      new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
                        Number(m.volume) || 0,
                      ) +
                      ' USD',
                  ),
                ),
                h(External, { url: m.url }, isHe ? 'שוק ומידע נוסף ↗' : 'Рынок и условия ↗'),
              ),
            ),
          )
        : t('p', 'hint', L.noMarket),
      markets.length > 6
        ? h(
            'button',
            { type: 'button', className: 'more', onClick: () => setShowAll(!showAll) },
            showAll ? L.less : L.more + ' (' + (markets.length - 6) + ')',
          )
        : null,
      t('p', 'rw-fineprint', L.marketSub),
    ),
    panelNotice('aviation', L.aviation, aviation, aviationError, aviationPending),
    isHe ? localized(L.aviation, aviation) : h(AviationExplainedV2, { data }),
    panelNotice('satellite', L.satellite, satellite, satelliteError, satellitePending),
    isHe ? localized(L.satellite, satellite) : h(SatelliteCatalog, { data }),
    h(
      'section',
      { className: 'section', id: 'official' },
      h(Head, { title: L.officialData, icon: 'files', sub: L.origin }),
      h(
        'div',
        { className: 'data-grid-2' },
        official(L.marad, data?.marad),
        official(L.centcom, data?.centcom),
      ),
    ),
    h(
      'section',
      { className: 'section', id: 'diagnostics' },
      h(Head, { title: L.method, icon: 'database', sub: L.methodSub }),
      h(
        Card,
        null,
        t('h3', null, L.sourceState),
        t('p', null, issues.length + ' / ' + allSources.length + ' ' + L.sources),
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
