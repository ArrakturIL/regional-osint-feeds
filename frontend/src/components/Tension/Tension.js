import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
// Tension index (owner 21.11): five regions, level 1–5 by how many independent
// families of signals left their own norm. A demo while the norm calibrates.
// The API sends codes only; labels live here in RU and HE.
const TENSION_L = {
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
