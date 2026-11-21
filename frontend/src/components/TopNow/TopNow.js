import { UI_HE, fmtTime, h, simpleTime, t } from '../../app/runtime.js';
import { GoLink } from '../Navigation/GoLink.js';
// Concept E «Главное сейчас» (owner 21.11): one lead story and four more, by
// urgency then freshness, beside the source network strip and the reading
// protocol. Items without a page-language title go last, not first.
const TOP_RANK = { urgent: 0, important: 1 };
export function topStories(stories, lang) {
  const list = (Array.isArray(stories) ? stories : []).filter(s => s && s.title);
  const shown = s => s.translation_state !== 'pending' || s.content_language === lang;
  return list
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        Number(!shown(a.s)) - Number(!shown(b.s)) ||
        (TOP_RANK[a.s.tier] ?? 2) - (TOP_RANK[b.s.tier] ?? 2) ||
        a.i - b.i,
    )
    .slice(0, 5)
    .map(x => x.s);
}
// Owner 21.11: a top card must say when the news is from. Age is relative to
// render time; the absolute stamp (Israel time) sits beside it.
export function topAge(time, now, he) {
  const n = now - Date.parse(time);
  if (!Number.isFinite(n) || n < 0) return '';
  const m = Math.floor(n / 60000);
  if (m < 1) return he ? 'עכשיו' : 'только что';
  if (m < 60) return he ? 'לפני ' + m + ' דק׳' : m + ' мин назад';
  const hr = Math.floor(m / 60);
  if (hr < 24) return he ? 'לפני ' + hr + ' שע׳' : hr + ' ч назад';
  const d = Math.floor(hr / 24);
  return he ? 'לפני ' + d + ' ימים' : d + ' дн назад';
}
const TOP_STATES = ['ok', 'partial', 'empty', 'error'];
export function networkCounts(sources) {
  const out = { ok: 0, partial: 0, empty: 0, error: 0 };
  for (const s of Array.isArray(sources) ? sources : []) if (s && s.state in out) out[s.state] += 1;
  return out;
}
export function TopNow({ stories, overview, go }) {
  const he = UI_HE;
  const items = topStories(stories, he ? 'he' : 'ru');
  const [lead, ...rest] = items;
  const L = he
    ? {
        head: 'עיקר הדברים עכשיו',
        tier: { urgent: 'דחוף', important: 'חשוב', normal: 'רגיל' },
        single: 'מקור אחד · עדיין אין אימות בלתי תלוי',
        many: n => n + ' מקורות בלתי תלויים',
        all: 'לכל האירועים ←',
        net: 'רשת המקורות',
        st: { ok: 'תקינים', partial: 'חלקיים', empty: 'ללא רשומות', error: 'שגיאה' },
        data: 'לעמוד הנתונים ←',
        mon: 'בדיקת ניטור אחרונה',
        monState: { normal: 'ללא התרעות', attention: 'דורש תשומת לב', partial: 'חלקית' },
        proto: 'פרוטוקול קריאה',
        protoText:
          'דחיפות היא הערכת נושא הדיווח, לא את אמינותו. מספר המקורות מראה כמה גופים דיווחו באופן בלתי תלוי.',
        wait: 'ממתינים לפרסומים…',
      }
    : {
        head: 'Главное сейчас',
        tier: { urgent: 'Срочно', important: 'Важно', normal: 'Обычное' },
        single: 'Один источник · независимого подтверждения пока нет',
        many: n => 'Независимых источников: ' + n,
        all: 'Вся лента событий →',
        net: 'Сеть источников',
        st: { ok: 'норма', partial: 'частично', empty: 'пусто', error: 'ошибка' },
        data: 'Раздел «Данные» →',
        mon: 'Последняя проверка мониторинга',
        monState: { normal: 'без тревог', attention: 'есть изменения', partial: 'частичная' },
        proto: 'Протокол чтения',
        protoText:
          'Срочность — оценка темы сообщения, а не его достоверности. Число источников показывает, сколько изданий сообщило независимо.',
        wait: 'Получаем свежие публикации…',
      };
  const tierOf = s => (s.tier === 'urgent' || s.tier === 'important' ? s.tier : 'normal');
  const meta = s =>
    h(
      'p',
      { className: 'rw-top-meta' },
      h('span', { className: 'rw-top-tier rw-top-tier-' + tierOf(s) }, L.tier[tierOf(s)]),
      h('span', { className: 'rw-top-src' }, s.source || ''),
      s.time
        ? h(
            'time',
            { className: 'rw-top-time', dateTime: s.time, title: fmtTime(s.time) },
            h('bdi', { dir: he ? 'rtl' : 'ltr' }, fmtTime(s.time)),
            topAge(s.time, Date.now(), he) ? ' · ' + topAge(s.time, Date.now(), he) : '',
          )
        : null,
    );
  const title = (s, tag) =>
    h(
      tag,
      { className: 'rw-top-title' },
      s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title) : s.title,
    );
  const sources = Array.isArray(overview?.sources) ? overview.sources : [];
  const counts = networkCounts(sources);
  const strip = TOP_STATES.flatMap(state =>
    sources
      .filter(x => x && x.state === state)
      .map((x, i) =>
        h('i', {
          key: (x.id || state) + i,
          className: 'rw-net-seg rw-net-' + state,
          title: ((he ? x.label_he : x.label) || x.id || '') + ' — ' + L.st[state],
        }),
      ),
  );
  const independent = Number(lead?.reporting_origin_count || lead?.source_count || 1);
  return h(
    'section',
    { className: 'rw-top', 'aria-labelledby': 'rw-top-head' },
    h(
      'div',
      { className: 'rw-top-main' },
      h('h2', { className: 'rw-top-head', id: 'rw-top-head' }, L.head),
      lead
        ? h(
            'article',
            { className: 'rw-top-lead rw-top-' + tierOf(lead) },
            meta(lead),
            title(lead, 'h3'),
            lead.excerpt ? t('p', 'rw-top-excerpt', lead.excerpt) : null,
            t('p', 'rw-top-verify', independent > 1 ? L.many(independent) : L.single),
          )
        : t('p', 'hint', L.wait),
      rest.length
        ? h(
            'div',
            { className: 'rw-top-grid' },
            ...rest.map((s, i) =>
              h('article', { key: s.id || i, className: 'rw-top-card rw-top-' + tierOf(s) }, meta(s), title(s, 'h3')),
            ),
          )
        : null,
      h(
        GoLink,
        { to: (he ? '/he' : '') + '/events#all-news', go, className: 'rw-more-link rw-top-all' },
        L.all,
      ),
    ),
    h(
      'aside',
      { className: 'rw-top-side' },
      h(
        'div',
        { className: 'rw-net' },
        t('h2', 'rw-top-head', L.net),
        sources.length ? h('div', { className: 'rw-net-strip', role: 'img', 'aria-label': L.net }, ...strip) : null,
        h(
          'dl',
          { className: 'rw-net-counts' },
          ...TOP_STATES.map(state =>
            h(
              'div',
              { key: state, className: 'rw-net-count rw-net-' + state },
              h('dt', null, String(counts[state]).padStart(2, '0')),
              h('dd', null, L.st[state]),
            ),
          ),
        ),
        // 21.11: the old «Главное из последнего анализа» card said little more
        // than this line; it moved here.
        overview?.analysis?.time
          ? h(
              'p',
              { className: 'rw-net-mon' },
              L.mon + ': ',
              h('bdi', { dir: 'ltr' }, simpleTime(overview.analysis.time)),
              L.monState[overview.analysis.state] ? ' · ' + L.monState[overview.analysis.state] : '',
            )
          : null,
        h(GoLink, { to: (he ? '/he' : '') + '/data', go, className: 'rw-net-link' }, L.data),
      ),
      h(
        'div',
        { className: 'rw-proto' },
        t('h2', 'rw-top-head', L.proto),
        t('p', null, L.protoText),
      ),
    ),
  );
}
