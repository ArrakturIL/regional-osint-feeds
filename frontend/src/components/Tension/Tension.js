import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
// Tension index (owner 21.11): five regions, level 1–5 by how many independent
// families of signals left their own norm. A demo while the norm calibrates.
// The API sends codes only; labels live here in RU and HE.
export const TENSION_L = {
  ru: {
    head: 'Необычная активность',
    demo: 'демо',
    lead: 'Сравниваем открытые источники с их обычным уровнем за две недели. Не прогноз и не подтверждение событий.',
    regions: {
      iran: 'Иран',
      levant: 'Израиль, Ливан, Сирия',
      gulf: 'Залив и Ормуз',
      red_sea: 'Красное море и Йемен',
      iraq: 'Ирак',
    },
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
    usual: 'обычно до',
    quiet: 'Как обычно',
    missing: n => 'нет данных по ' + n + ' сигн.',
    note: d => 'Демо, идёт калибровка: норма пока по ' + d + ' дн. из 30.',
    asOf: 'по состоянию на ',
  },
  he: {
    head: 'פעילות חריגה',
    demo: 'הדגמה',
    lead: 'משווים מקורות פתוחים לרמה הרגילה שלהם בשבועיים האחרונים. זו אינה תחזית ואינה אישור לאירועים.',
    regions: {
      iran: 'איראן',
      levant: 'ישראל, לבנון, סוריה',
      gulf: 'המפרץ והורמוז',
      red_sea: 'ים סוף ותימן',
      iraq: 'עיראק',
    },
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
    usual: 'בדרך כלל עד',
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
  return name + ': ' + v + ', ' + L.usual + ' ' + roundNum(d.p95);
}

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
    active.length
      ? h(
          'ol',
          { className: 'rw-tension-list' },
          ...active.map(r => {
            const lit = new Set(r.families || []);
            const details = Array.isArray(r.details) && r.details.length ? r.details : (r.signals || []).map(indicator => ({ indicator }));
            return h(
              'li',
              { key: r.id, className: 'rw-tension-region rw-tension-l' + r.level },
              h(
                'div',
                { className: 'rw-tension-rhead' },
                h('h3', null, L.regions[r.id] || r.id),
                h('p', { className: 'rw-tension-level', title: r.level + '/5' }, L.level[r.level] || ''),
              ),
              h(
                'ul',
                { className: 'rw-tension-fam', 'aria-label': (L.level[r.level] || '') + ': ' + [...lit].map(f => L.families[f] || f).join(', ') },
                ...TENSION_FAMILIES.map(f => h('li', { key: f, className: lit.has(f) ? 'on' : '' }, L.families[f])),
              ),
              h('ul', { className: 'rw-tension-why' }, ...details.map(d => h('li', { key: d.indicator }, tensionReason(d, L)))),
              missing(r) ? t('p', 'rw-tension-seen', L.missing(missing(r))) : null,
            );
          }),
        )
      : null,
    quiet.length
      ? h(
          'p',
          { className: 'rw-tension-quiet' },
          h('b', null, L.quiet + ': '),
          quiet.map(r => L.regions[r.id] || r.id).join(', '),
        )
      : null,
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
    tension ? t('p', 'rw-tension-note', tension.calibrating ? L.note(tension.baseline_days) + ' ' + L.lead : L.lead) : null,
  );
}
