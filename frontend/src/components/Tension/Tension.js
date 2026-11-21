import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
// Tension index (owner 21.11): five regions, level 1–5 by how many independent
// families of signals left their own norm. A demo while the norm calibrates.
// The API sends codes only; labels live here in RU and HE.
export const TENSION_L = {
  ru: {
    head: 'Индекс напряжённости',
    demo: 'демо',
    regions: {
      iran: 'Иран',
      levant: 'Израиль, Ливан, Сирия',
      gulf: 'Залив и Ормуз',
      red_sea: 'Красное море и Йемен',
      iraq: 'Ирак',
    },
    level: ['', 'тихо', 'слабый сигнал', 'заметно', 'высоко', 'очень высоко'],
    signals: {
      mil_aircraft: 'военные борта',
      mil_tanker_airlift: 'заправщики и транспортники',
      adsb_military: 'военные в выборке ADS-B',
      sar_dark_vessels: '«тёмные» суда',
      firms_hotspots: 'тепловые точки',
      copernicus_activation: 'картирование ЧС',
      internet_outage: 'отключение интернета',
      urgent_news: 'срочные новости',
      gdelt_conflict: 'события GDELT',
      official_notice: 'официальное предупреждение',
    },
    calm: 'всё в пределах нормы',
    seen: (a, b) => 'видим ' + a + ' из ' + b,
    note: d =>
      'Демо, идёт калибровка: норма пока по ' +
      d +
      ' дн. из 30. Индекс показывает, насколько источники отклонились от обычного для этого региона, — это не прогноз и не подтверждение событий.',
    noteReady:
      'Индекс показывает, насколько источники отклонились от обычного для этого региона, — это не прогноз и не подтверждение событий.',
    asOf: 'по состоянию на ',
  },
  he: {
    head: 'מדד המתיחות',
    demo: 'הדגמה',
    regions: {
      iran: 'איראן',
      levant: 'ישראל, לבנון, סוריה',
      gulf: 'המפרץ והורמוז',
      red_sea: 'ים סוף ותימן',
      iraq: 'עיראק',
    },
    level: ['', 'שקט', 'אות חלש', 'מורגש', 'גבוה', 'גבוה מאוד'],
    signals: {
      mil_aircraft: 'מטוסים צבאיים',
      mil_tanker_airlift: 'מטוסי תדלוק ותובלה',
      adsb_military: 'צבאיים בדגימת ADS-B',
      sar_dark_vessels: 'כלי שיט „חשוכים”',
      firms_hotspots: 'מוקדי חום',
      copernicus_activation: 'מיפוי חירום',
      internet_outage: 'ניתוק אינטרנט',
      urgent_news: 'חדשות דחופות',
      gdelt_conflict: 'אירועי GDELT',
      official_notice: 'אזהרה רשמית',
    },
    calm: 'הכול בטווח הרגיל',
    seen: (a, b) => a + ' מתוך ' + b + ' מקורות',
    note: d =>
      'הדגמה, הכיול נמשך: הבסיס מחושב כרגע על ' +
      d +
      ' ימים מתוך 30. המדד מראה עד כמה המקורות חרגו מהרגיל לאזור — זו אינה תחזית ואינה אישור לאירועים.',
    noteReady: 'המדד מראה עד כמה המקורות חרגו מהרגיל לאזור — זו אינה תחזית ואינה אישור לאירועים.',
    asOf: 'נכון ל־',
  },
};

export function Tension({ tension }) {
  if (!tension || !Array.isArray(tension.regions) || !tension.regions.length) return null;
  const L = TENSION_L[UI_HE ? 'he' : 'ru'];
  return h(
    'section',
    { className: 'rw-tension', 'aria-labelledby': 'rw-tension-head' },
    h(
      'div',
      { className: 'rw-tension-top' },
      h(
        'h2',
        { className: 'rw-top-head', id: 'rw-tension-head' },
        L.head,
        tension.calibrating ? h('span', { className: 'rw-tension-demo' }, L.demo) : null,
      ),
      h(
        'p',
        { className: 'rw-tension-asof' },
        L.asOf,
        h('bdi', { dir: UI_HE ? 'rtl' : 'ltr' }, fmtTime(tension.as_of)),
      ),
    ),
    h(
      'ol',
      { className: 'rw-tension-list' },
      ...tension.regions.map(r =>
        h(
          'li',
          { key: r.id, className: 'rw-tension-region rw-tension-l' + r.level },
          h('h3', null, L.regions[r.id] || r.id),
          h(
            'div',
            {
              className: 'rw-tension-meter',
              role: 'img',
              'aria-label': r.level + ' / 5 · ' + (L.level[r.level] || ''),
            },
            ...[1, 2, 3, 4, 5].map(i => h('i', { key: i, className: i <= r.level ? 'on' : '' })),
          ),
          h(
            'p',
            { className: 'rw-tension-level' },
            h('b', null, r.level + '/5'),
            ' · ' + (L.level[r.level] || ''),
          ),
          t(
            'p',
            'rw-tension-signals',
            r.signals?.length ? r.signals.map(s => L.signals[s] || s).join(' · ') : L.calm,
          ),
          r.coverage ? t('p', 'rw-tension-seen', L.seen(r.coverage.seen, r.coverage.total)) : null,
        ),
      ),
    ),
    t('p', 'rw-tension-note', tension.calibrating ? L.note(tension.baseline_days) : L.noteReady),
  );
}

// «Данные» (owner 21.11, variant A): the same index in full — every flagged
// signal with its value against the 14-day norm, per region.
const TENSION_DETAIL = {
  ru: {
    head: 'Индекс напряжённости — подробно',
    sub: 'Каждый сигнал сравнивается со своей нормой за 14 дней, без последних суток. Уровень — сколько разных семейств сигналов вышли за норму.',
    signal: 'Сигнал',
    now: 'Сейчас',
    norm: 'Норма',
    event: 'событие',
    median: 'медиана',
    upTo: 'до',
    calm: 'Все сигналы в пределах нормы.',
    wait: 'Индекс ещё считается.',
  },
  he: {
    head: 'מדד המתיחות — בפירוט',
    sub: 'כל אות מושווה לבסיס שלו ב־14 הימים האחרונים, ללא היממה האחרונה. הרמה — כמה משפחות אותות שונות חרגו מהרגיל.',
    signal: 'אות',
    now: 'עכשיו',
    norm: 'רגיל',
    event: 'אירוע',
    median: 'חציון',
    upTo: 'עד',
    calm: 'כל האותות בטווח הרגיל.',
    wait: 'המדד עדיין מחושב.',
  },
};
export function TensionDetail({ tension }) {
  const lang = UI_HE ? 'he' : 'ru',
    L = TENSION_L[lang],
    D = TENSION_DETAIL[lang];
  const num = v => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : '—');
  return h(
    'section',
    { className: 'section rw-tension-detail', id: 'index' },
    h(
      'div',
      { className: 'section-head' },
      h('div', null, h('div', { className: 'rw-title-with-icon' }, t('h2', null, D.head)), t('p', null, D.sub)),
    ),
    !tension
      ? t('p', 'hint', D.wait)
      : h(
          'div',
          { className: 'rw-tension-detail-grid' },
          ...tension.regions.map(r =>
            h(
              'article',
              { key: r.id, className: 'panel rw-tension-l' + r.level },
              h('h3', null, (L.regions[r.id] || r.id) + ' · ' + r.level + '/5'),
              r.details?.length
                ? h(
                    'table',
                    { className: 'rw-tension-table' },
                    h('thead', null, h('tr', null, t('th', null, D.signal), t('th', null, D.now), t('th', null, D.norm))),
                    h(
                      'tbody',
                      null,
                      ...r.details.map(d =>
                        h(
                          'tr',
                          { key: d.indicator },
                          t('td', null, L.signals[d.indicator] || d.indicator),
                          t('td', 'num', num(d.value)),
                          t(
                            'td',
                            'num',
                            d.rule !== undefined
                              ? D.event
                              : D.upTo + ' ' + num(d.p95) + ' · ' + D.median + ' ' + num(d.median),
                          ),
                        ),
                      ),
                    ),
                  )
                : t('p', 'hint', D.calm),
              r.coverage ? t('p', 'rw-tension-seen', L.seen(r.coverage.seen, r.coverage.total)) : null,
            ),
          ),
        ),
    tension ? t('p', 'rw-tension-note', tension.calibrating ? L.note(tension.baseline_days) : L.noteReady) : null,
  );
}
