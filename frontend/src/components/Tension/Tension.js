import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
// Tension index (owner 21.11): five regions, level 1–5 by how many independent
// families of signals left their own norm. A demo while the norm calibrates.
// The API sends codes only; labels live here in RU and HE.
export const TENSION_L = {
  ru: {
    head: 'Необычная активность',
    demo: 'демо',
    lead: 'Каждый час считаем по шести регионам: военные самолёты в небе, суда с выключенным маячком, пожары на спутниковых снимках, отключения интернета, срочные новости и официальные предупреждения. Если чего-то сейчас заметно больше, чем обычно бывало за последние две недели, это отклонение. Чем больше разных отклонений сразу, тем выше уровень. Это не прогноз и не подтверждение событий.',
    regions: {
      iran: 'Иран',
      israel: 'Израиль',
      lebanon_syria: 'Ливан, Сирия, Иордания',
      levant: 'Израиль, Ливан, Сирия',
      gulf: 'Залив и Ормуз',
      red_sea: 'Красное море и Йемен',
      iraq: 'Ирак',
    },
    short: { israel: 'Израиль', lebanon_syria: 'Ливан и Сирия', iran: 'Иран', gulf: 'Залив', red_sea: 'Красное море', iraq: 'Ирак' },
    level: ['', 'как обычно', 'одно отклонение', 'два независимых отклонения', 'три независимых отклонения', 'много отклонений'],
    families: {
      air: 'военная авиация',
      sea: 'море',
      ground: 'пожары и спутники',
      cyber: 'интернет',
      news: 'новости',
      official: 'официальные',
    },
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
      official_notice: 'официальные предупреждения',
    },
    usual: 'обычно не больше',
    legend: 'Значок горит — этого сейчас больше обычного:',
    open: 'подробнее',
    times: n => ' (' + n + ' обновл.)',
    last: 'последнее ',
    bodies: {
      fcdo: 'МИД Великобритании обновил рекомендации для поездок',
      state_dept: 'Госдеп США обновил предупреждение для поездок',
      easa: 'EASA выпустило бюллетень о зонах конфликта',
      marad_official: 'Морская администрация США выпустила предупреждение для судов',
      mscio: 'MSCIO выпустил предупреждение для судоходства',
    },
    quiet: 'Как обычно',
    missing: n => 'нет данных по ' + n + ' сигн.',
    note: d => 'Демо, идёт калибровка: норма пока по ' + d + ' дн. из 30.',
    asOf: 'по состоянию на ',
  },
  he: {
    head: 'פעילות חריגה',
    demo: 'הדגמה',
    lead: 'בכל שעה אנחנו סופרים בשישה אזורים: מטוסים צבאיים באוויר, כלי שיט שכיבו את המשדר, שריפות בתמונות לוויין, ניתוקי אינטרנט, חדשות דחופות ואזהרות רשמיות. אם משהו גבוה כעת בבירור מהרגיל בשבועיים האחרונים — זו חריגה. ככל שיש יותר חריגות שונות בבת אחת, הרמה גבוהה יותר. זו אינה תחזית ואינה אישור לאירועים.',
    regions: {
      iran: 'איראן',
      israel: 'ישראל',
      lebanon_syria: 'לבנון, סוריה, ירדן',
      levant: 'ישראל, לבנון, סוריה',
      gulf: 'המפרץ והורמוז',
      red_sea: 'ים סוף ותימן',
      iraq: 'עיראק',
    },
    short: { israel: 'ישראל', lebanon_syria: 'לבנון וסוריה', iran: 'איראן', gulf: 'המפרץ', red_sea: 'ים סוף', iraq: 'עיראק' },
    level: ['', 'כרגיל', 'חריגה אחת', 'שתי חריגות בלתי תלויות', 'שלוש חריגות בלתי תלויות', 'חריגות רבות'],
    families: {
      air: 'תעופה צבאית',
      sea: 'ים',
      ground: 'שריפות ולוויינים',
      cyber: 'אינטרנט',
      news: 'חדשות',
      official: 'רשמי',
    },
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
      official_notice: 'אזהרות רשמיות',
    },
    usual: 'בדרך כלל לא יותר מ־',
    legend: 'סמל דולק — יש מזה כעת יותר מהרגיל:',
    open: 'פרטים',
    times: n => ' (' + n + ' עדכונים)',
    last: 'אחרון ',
    bodies: {
      fcdo: 'משרד החוץ הבריטי עדכן את המלצות הנסיעה',
      state_dept: 'מחלקת המדינה האמריקאית עדכנה את אזהרת הנסיעה',
      easa: 'EASA פרסמה עלון על אזורי עימות',
      marad_official: 'מינהל הספנות האמריקאי פרסם אזהרה לכלי שיט',
      mscio: 'MSCIO פרסם אזהרה לספנות',
    },
    quiet: 'כרגיל',
    missing: n => 'אין נתונים ל־' + n + ' אותות',
    note: d => 'הדגמה, הכיול נמשך: הבסיס מחושב כרגע על ' + d + ' ימים מתוך 30.',
    asOf: 'נכון ל־',
  },
};
export const TENSION_FAMILIES = ['air', 'sea', 'ground', 'cyber', 'news', 'official'];
const roundNum = v => (typeof v === 'number' ? String(Math.round(v * 10) / 10) : '');
// One reason line: «военные борта: 14, обычно до 6». Rule signals (events)
// have no norm, so only the count.
export function tensionReason(d, L) {
  const name = L.signals[d.indicator] || d.indicator;
  const v = roundNum(d.value);
  if (d.rule !== undefined || typeof d.p95 !== 'number') return v ? name + ': ' + v : name;
  return name + ': ' + v + ' · ' + L.usual + ' ' + roundNum(d.p95);
}
// Owner 22.11: say whose notice it is — one line per body, with the date.
const ddmm = iso => {
  const x = new Date(iso);
  return Number.isFinite(x.getTime())
    ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' }).format(x)
    : '';
};
export function tensionReasons(d, L) {
  if (d.indicator === 'official_notice' && Array.isArray(d.refs) && d.refs.length)
    return d.refs.map(
      r => (L.bodies[r.source] || r.source) + (r.n > 1 ? L.times(r.n) : '') + (ddmm(r.at) ? ', ' + (r.n > 1 ? L.last : '') + ddmm(r.at) : ''),
    );
  return [tensionReason(d, L)];
}
// Six family icons (Material Icons, Apache 2.0), 24×24.
const ICON = {
  air: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z',
  sea: 'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99a8.75 8.75 0 0 0 8 0c1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1 1 0 0 0-.66 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z',
  ground: 'M12 12.9l-2.13 2.09c-.56.56-.87 1.29-.87 2.07C9 18.68 10.35 20 12 20s3-1.32 3-2.94c0-.78-.31-1.52-.87-2.07L12 12.9zM16 6l-.44.55C14.38 8.02 12 7.19 12 5.3V2S4 6 4 13c0 2.92 1.56 5.47 3.89 6.86-.56-.79-.89-1.76-.89-2.8 0-1.32.52-2.56 1.47-3.5L12 10.1l3.53 3.47c.95.93 1.47 2.17 1.47 3.5 0 1.02-.31 1.96-.85 2.75 1.89-1.15 3.29-3.06 3.71-5.3.66-3.55-1.08-6.9-3.86-8.52z',
  cyber: 'M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.24 4.24 0 0 0-6 0zm-4-4l2 2a7.07 7.07 0 0 1 10 0l2-2C15.14 9.14 8.87 9.14 5 13z',
  news: 'M4 4h13v15a1 1 0 0 0 1 1H5a1 1 0 0 1-1-1V4zm15 4h2v11a1 1 0 0 1-2 0V8zM7 7v4h7V7H7zm0 6v1.5h7V13H7zm0 3v1.5h7V16H7z',
  official: 'M12 2 4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
};
const famIcon = (f, on, L) =>
  h(
    'li',
    { key: f, className: on ? 'on' : '', title: L.families[f] },
    h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: ICON[f] })),
    h('span', null, L.families[f]),
  );
// Owner 22.11: «абсолютно не понятно что он показывает». The home block now
// names what is measured (deviation from the usual, not danger), lights the
// families that left their norm, and says why in a phrase with the number.
// Regions as usual fold into one line.
export function Tension({ tension }) {
  if (!tension || !Array.isArray(tension.regions) || !tension.regions.length) return null;
  const L = TENSION_L[UI_HE ? 'he' : 'ru'];
  const active = tension.regions.filter(r => r.level > 1).sort((a, b) => b.level - a.level);
  const quiet = tension.regions.filter(r => !(r.level > 1));
  const missing = r => (r.coverage && r.coverage.total > r.coverage.seen ? r.coverage.total - r.coverage.seen : 0);
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
      h('p', { className: 'rw-tension-asof' }, L.asOf, h('bdi', { dir: UI_HE ? 'rtl' : 'ltr' }, fmtTime(tension.as_of))),
    ),
    t('p', 'rw-tension-lead', L.lead),
    h(
      'div',
      { className: 'rw-tension-body' },
      h(
        'div',
        { className: 'rw-tension-visual' },
        h(
          'div',
          { className: 'rw-tension-legend' },
          t('p', null, L.legend),
          h('ul', { className: 'rw-tension-fam' }, ...TENSION_FAMILIES.map(f => famIcon(f, true, L))),
        ),
      ),
      h(
        'div',
        { className: 'rw-tension-cards' },
        active.length
          ? h(
              'ol',
              { className: 'rw-tension-list' },
              ...active.map(r => {
                const lit = new Set(r.families || []);
                const details = Array.isArray(r.details) && r.details.length ? r.details : (r.signals || []).map(indicator => ({ indicator }));
                return h(
                  'li',
                  { key: r.id, id: 'ten-' + r.id, className: 'rw-tension-region rw-tension-l' + r.level },
                  h(
                    'div',
                    { className: 'rw-tension-rhead' },
                    h('h3', null, L.regions[r.id] || r.id),
                    h('p', { className: 'rw-tension-level', title: r.level + '/5' }, L.level[r.level] || ''),
                  ),
                  h(
                    'ul',
                    { className: 'rw-tension-fam rw-tension-fam-sm', 'aria-label': [...lit].map(f => L.families[f] || f).join(', ') },
                    ...TENSION_FAMILIES.map(f => famIcon(f, lit.has(f), L)),
                  ),
                  h('ul', { className: 'rw-tension-why' }, ...details.flatMap(d => tensionReasons(d, L)).map((x, i) => h('li', { key: i }, x))),
                  missing(r) ? t('p', 'rw-tension-seen', L.missing(missing(r))) : null,
                );
              }),
            )
          : null,
        quiet.length
          ? h('p', { className: 'rw-tension-quiet' }, h('b', null, L.quiet + ': '), quiet.map(r => L.regions[r.id] || r.id).join(', '))
          : null,
      ),
    ),
    tension.calibrating ? t('p', 'rw-tension-note', L.note(tension.baseline_days)) : null,
  );
}

// «Данные» (owner 21.11, variant A): the same index in full — every flagged
// signal with its value against the 14-day norm, per region.
const TENSION_DETAIL = {
  ru: {
    head: 'Необычная активность — подробно',
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
    head: 'פעילות חריגה — בפירוט',
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
                          t('td', null, d.indicator === 'official_notice' && d.refs?.length ? tensionReasons(d, L).join('; ') : L.signals[d.indicator] || d.indicator),
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
              r.coverage && r.coverage.total > r.coverage.seen ? t('p', 'rw-tension-seen', L.missing(r.coverage.total - r.coverage.seen)) : null,
            ),
          ),
        ),
    tension ? t('p', 'rw-tension-note', tension.calibrating ? L.note(tension.baseline_days) + ' ' + L.lead : L.lead) : null,
  );
}
