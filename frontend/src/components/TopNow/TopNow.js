import { UI_HE, fmtTime, h, simpleTime, t } from '../../app/runtime.js';
import { GoLink } from '../Navigation/GoLink.js';
// Concept E «Главное сейчас» (owner 21.11): one lead story and four more, by
// urgency then freshness, beside the source network strip and the reading
// protocol. Items without a page-language title go last, not first.
const TOP_RANK = { urgent: 0, important: 1 };
// Owner 23.11: an outlet with a one-sided line (Al Jazeera) reaches the front
// page only when a second, independent outlet reported the same event.
export const corroborated = s =>
  !s?.needs_corroboration || Number(s.reporting_origin_count || s.source_count || 1) >= 2;
export function topStories(stories, lang, count = 5) {
  const list = (Array.isArray(stories) ? stories : []).filter(s => s && s.title && corroborated(s));
  const shown = s => s.translation_state !== 'pending' || s.content_language === lang;
  return list
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        Number(!shown(a.s)) - Number(!shown(b.s)) ||
        (TOP_RANK[a.s.tier] ?? 2) - (TOP_RANK[b.s.tier] ?? 2) ||
        a.i - b.i,
    )
    .slice(0, count)
    .map(x => x.s);
}
// Owner 22.11: the lead must earn its place. Only «срочно»/«важно» from the last
// 6 h; urgent first, then confirmed by ≥2 independent outlets, then the freshest.
// Nothing qualifies — no lead, all cards equal.
const LEAD_WINDOW_MS = 6 * 3600 * 1000;
export const sourcesOf = s =>
  [...new Set((Array.isArray(s?.related) ? s.related : []).map(r => r && r.title).filter(Boolean))].length
    ? [...new Set(s.related.map(r => r && r.title).filter(Boolean))]
    : s?.source
      ? [s.source]
      : [];
export function topLead(items, lang, now = Date.now()) {
  const list = (Array.isArray(items) ? items : []).filter(corroborated);
  const fresh = s => now - Date.parse(s.time) <= LEAD_WINDOW_MS;
  const shown = s => s.translation_state !== 'pending' || s.content_language === lang;
  const confirmed = s => Number(s.reporting_origin_count || s.source_count || 1) >= 2;
  const pool = list
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => (s.tier === 'urgent' || s.tier === 'important') && shown(s) && fresh(s))
    .sort(
      (a, b) =>
        (TOP_RANK[a.s.tier] ?? 2) - (TOP_RANK[b.s.tier] ?? 2) ||
        Number(!confirmed(a.s)) - Number(!confirmed(b.s)) ||
        Date.parse(b.s.time) - Date.parse(a.s.time) ||
        a.i - b.i,
    );
  const lead = pool.length ? pool[0].s : null;
  return { lead, rest: list.filter(s => s !== lead) };
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
// Owner 22.11: many feeds send the headline again as the summary. A summary
// that only repeats the title (or is part of it) adds nothing; skip it.
const plainText = x =>
  String(x || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function leadExcerpt(s) {
  const ex = plainText(s?.excerpt);
  const ti = plainText(s?.title);
  if (!ex || ex === ti || ti.includes(ex) || ex.includes(ti) && ex.length - ti.length < 24) return '';
  return trimExcerpt(s.excerpt);
}
// Owner 23.11: the excerpt ended mid-word («израильско…»): CSS clamped it at
// the third line. Cut in code instead: whole sentences up to the limit, else
// the last whole word plus «…»; a source summary already cut mid-word loses
// its broken tail.
export const EXCERPT_MAX = 220;
export function trimExcerpt(text, max = EXCERPT_MAX) {
  let x = String(text || '').trim();
  const cutIn = /(?:…|\.\.\.)$/.test(x);
  if (cutIn) x = x.replace(/(?:…|\.\.\.)$/, '').trim();
  if (x.length <= max && !cutIn) return x;
  const head = x.slice(0, max + 1);
  let end = -1;
  for (const m of head.matchAll(/[.!?](?:[»"”)])?(?=\s|$)/g)) end = m.index + m[0].length;
  if (end >= 80 && end <= max) return head.slice(0, end);
  const words = (x.length <= max ? x : head).split(/\s+/);
  if (x.length > max || cutIn) words.pop();
  return words.join(' ').replace(/[\s,;:—–-]+$/, '') + '…';
}
const TOP_STATES = ['ok', 'partial', 'empty', 'error'];
export function networkCounts(sources) {
  const out = { ok: 0, partial: 0, empty: 0, error: 0 };
  for (const s of Array.isArray(sources) ? sources : []) if (s && s.state in out) out[s.state] += 1;
  return out;
}
export function TopNow({ stories, overview, go }) {
  const he = UI_HE;
  const ordered = topStories(stories, he ? 'he' : 'ru', 6);
  const picked = topLead(ordered, he ? 'he' : 'ru');
  const lead = picked.lead;
  const rest = picked.rest.slice(0, lead ? 4 : 5);
  const L = he
    ? {
        head: 'עיקר הדברים עכשיו',
        tier: { urgent: 'דחוף', important: 'חשוב', normal: 'רגיל' },
        leadHead: 'העיקר בשעות האחרונות',
        leadWhy: 'הדחוף ביותר, ומאומת בכמה כלי תקשורת כשאפשר',
        many: names => 'דיווחו: ' + names.join(', '),
        single: name => 'בינתיים רק ' + name + ' — כלי תקשורת אחרים עוד לא אישרו',
        all: 'לכל העדכונים ←',
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
        leadHead: 'Главное за последние часы',
        leadWhy: 'самая срочная новость, по возможности подтверждённая несколькими изданиями',
        many: names => 'Сообщили: ' + names.join(', '),
        single: name => 'Пока только ' + name + ' — другие издания не подтвердили',
        all: 'Вся лента →',
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
  const leadSources = lead ? sourcesOf(lead) : [];
  return h(
    'section',
    { className: 'rw-top', 'aria-labelledby': 'rw-top-head' },
    h(
      'div',
      { className: 'rw-top-main' },
      h('h2', { className: 'rw-top-head', id: 'rw-top-head' }, L.head),
      // Owner 22.11: the reading protocol must be seen before the cards, not
      // after them in the side column.
      h(
        'p',
        { className: 'rw-proto-note', role: 'note' },
        h('b', null, L.proto + '. '),
        L.protoText,
      ),
      lead ? t('p', 'rw-top-leadhead', L.leadHead + ' · ' + L.leadWhy) : null,
      lead
        ? h(
            'article',
            { className: 'rw-top-lead rw-top-' + tierOf(lead) },
            meta(lead),
            title(lead, 'h3'),
            leadExcerpt(lead) ? t('p', 'rw-top-excerpt', leadExcerpt(lead)) : null,
            leadSources.length > 1
              ? t('p', 'rw-top-verify', L.many(leadSources))
              : leadSources.length
                ? t('p', 'rw-top-verify', L.single(leadSources[0]))
                : null,
          )
        : rest.length
          ? null
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
        { to: (he ? '/he' : '') + '/feed', go, className: 'rw-more-link rw-top-all' },
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
    ),
  );
}
