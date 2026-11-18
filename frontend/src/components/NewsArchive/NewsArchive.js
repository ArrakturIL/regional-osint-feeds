import { classifyFailure, failureText } from '../../utils/feedFailure.js';
import { rwNormalizeNewsArticle } from '../../api/normalizeNewsArticle.js';
import { UI_HE, h, t, useEffect, useRef, useState } from '../../app/runtime.js';
import { Loading } from '../Loading/Loading.js';
import { NewsMasonry } from '../NewsMasonry/NewsMasonry.js';
import { Head } from '../SectionHead/Head.js';

const archiveDefaults = () => ({
  sort: 'latest',
  source: '',
  category: '',
  verification: '',
  minPriority: '',
  period: 'all',
  fromDate: '',
  toDate: '',
});

// Freeze relative ranges when Apply is pressed: page 2 must query the same
// interval and order hash as page 1, even if the clock crosses a minute.
export function rwArchiveRange({ period = 'all', fromDate = '', toDate = '' } = {}, now = Date.now()) {
  if (period === '24h' || period === '72h' || period === '7d')
    return { fromMs: now - { '24h': 24, '72h': 72, '7d': 168 }[period] * 3600000, toMs: null };
  if (period !== 'custom') return { fromMs: null, toMs: null };
  const midnight = value => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('invalid_date');
    const ms = Date.parse(value + 'T00:00:00Z');
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value)
      throw new RangeError('invalid_date');
    return ms;
  };
  const fromMs = midnight(fromDate),
    toStart = midnight(toDate);
  const toMs = toStart === null ? null : toStart + 86400000 - 1;
  if (fromMs !== null && toMs !== null && fromMs > toMs) throw new RangeError('reversed_dates');
  return { fromMs, toMs };
}

// Never sort or filter a single fetched page client-side. The API applies
// conditions globally before pagination and returns a locale-stable hash.
export function rwArchiveRequest({
  language = 'ru',
  page = 1,
  pageSize = 12,
  sort = 'latest',
  source = '',
  category = '',
  verification = '',
  minPriority = '',
  fromMs = null,
  toMs = null,
  expectedHash = null,
} = {}) {
  const q = new URLSearchParams();
  q.set('lang', language);
  q.set('limit', String(pageSize));
  q.set('offset', String((page - 1) * pageSize));
  q.set('sort', sort);
  if (String(source).trim()) q.set('source', String(source).trim());
  if (category) q.set('category', category);
  if (verification) q.set('verification', verification);
  if (minPriority !== '' && minPriority !== null) q.set('min_priority', String(minPriority));
  if (fromMs !== null) q.set('from_ms', String(fromMs));
  if (toMs !== null) q.set('to_ms', String(toMs));
  if (page > 1 && expectedHash) q.set('expected_order_hash', expectedHash);
  return '/api/news?' + q.toString();
}

export function rwArchiveValidatePayload(body, lang, offset, pageSize) {
  const valid =
    body &&
    typeof body === 'object' &&
    body.requested_language === lang &&
    Array.isArray(body.articles) &&
    Number.isInteger(body.total_events) &&
    body.total_events >= 0 &&
    body.offset === offset &&
    body.articles.length <= pageSize &&
    typeof body.feed_order_hash === 'string' &&
    /^[a-f0-9]{64}$/i.test(body.feed_order_hash) &&
    (body.next_offset === null || body.next_offset === offset + pageSize) &&
    body.total_events >= offset + body.articles.length &&
    body.articles.every(
      (x, i) => x && typeof x.event_id === 'string' && x.event_id && x.feed_rank === offset + i,
    );
  if (!valid) throw Object.assign(new Error('Invalid news page response'), { rwInvalid: true });
  return body;
}

export function NewsArchive() {
  const [page, setPage] = useState(1),
    [expanded, setExpanded] = useState(null),
    [read, setRead] = useState({}),
    [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(null),
    [refresh, setRefresh] = useState(0);
  const [draft, setDraft] = useState(archiveDefaults),
    [applied, setApplied] = useState(() => ({ ...archiveDefaults(), fromMs: null, toMs: null }));
  const [formError, setFormError] = useState(null),
    [notice, setNotice] = useState(null);
  const orderHash = useRef(null);
  const pageSize = 12,
    label = UI_HE;
  const strings = label
    ? {
        heading: 'כל העדכונים',
        sub: 'אירועים מהשבוע האחרון. סדר העדכונים נקבע בשרת; דיווח אינו אימות עצמאי.',
        latest: 'החדשות ביותר',
        priority: 'החשובות',
        sortLabel: 'מיון',
        filterTitle: 'סינון החדשות',
        source: 'מקור',
        sourceHint: 'שם מדויק של מקור',
        category: 'נושא',
        verification: 'סיקור',
        importance: 'חשיבות',
        period: 'תקופה',
        from: 'מתאריך (UTC)',
        to: 'עד תאריך (UTC)',
        any: 'הכול',
        strike: 'תקיפה',
        military: 'צבאי',
        negotiation: 'משא ומתן',
        diplomacy: 'דיפלומטיה',
        election: 'בחירות',
        governance: 'ממשל',
        sanctions: 'סנקציות',
        statement: 'הצהרה',
        other: 'אחר',
        multiple: 'כמה מערכות חדשות — לא אימות עצמאי',
        single: 'מקור דיווח אחד',
        p24: '24 שעות',
        p72: '3 ימים',
        p7: '7 ימים',
        custom: 'תאריכים',
        p4: '4 ומעלה',
        p7min: '7 ומעלה',
        p9: '9 ומעלה',
        apply: 'החל מסננים',
        reset: 'איפוס',
        badDate: 'טווח תאריכים לא תקין.',
        changed: 'הסדר השתנה. חזרנו לעמוד הראשון כדי למנוע כפילויות.',
        loading: 'טוענים עמוד חדשות…',
        loadError: 'לא ניתן לטעון את עמוד החדשות. ',
        retry: 'נסו שוב',
        empty: 'אין פרסומים התואמים למסננים.',
        prev: 'הקודם',
        next: 'הבא',
        page: 'עמוד',
        of: 'מתוך',
        nav: 'דפדוף חדשות',
      }
    : {
        heading: 'Все публикации',
        sub: 'События за последние семь дней. Сортировка серверная; сообщения источников не равны независимому подтверждению.',
        latest: 'Последние',
        priority: 'Важные',
        sortLabel: 'Сортировка',
        filterTitle: 'Фильтры ленты',
        source: 'Источник',
        sourceHint: 'Точное название источника',
        category: 'Категория',
        verification: 'Освещение',
        importance: 'Важность',
        period: 'Период',
        from: 'С даты (UTC)',
        to: 'По дату (UTC)',
        any: 'Все',
        strike: 'Удары',
        military: 'Военные',
        negotiation: 'Переговоры',
        diplomacy: 'Дипломатия',
        election: 'Выборы',
        governance: 'Власть',
        sanctions: 'Санкции',
        statement: 'Заявления',
        other: 'Прочее',
        multiple: 'Несколько редакций — не независимая проверка',
        single: 'Одна цепочка сообщений',
        p24: '24 часа',
        p72: '3 дня',
        p7: '7 дней',
        custom: 'Свои даты',
        p4: 'От 4',
        p7min: 'От 7',
        p9: 'От 9',
        apply: 'Применить',
        reset: 'Сбросить',
        badDate: 'Некорректный диапазон дат.',
        changed: 'Лента изменилась. Перешли к первой странице, чтобы не дублировать новости.',
        loading: 'Загружаем страницу новостей…',
        loadError: 'Не удалось загрузить страницу. ',
        retry: 'Повторить',
        empty: 'По выбранным фильтрам публикаций нет.',
        prev: 'Назад',
        next: 'Далее',
        page: 'Страница',
        of: 'из',
        nav: 'Страницы новостей',
      };
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setResult(null);
    (async () => {
      const timer = setTimeout(() => ctrl.abort(), 14000);
      try {
        const url = rwArchiveRequest({
          language: label ? 'he' : 'ru',
          page,
          pageSize,
          ...applied,
          expectedHash: orderHash.current,
        });
        const resp = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
        if (resp.status === 409) {
          if (alive) {
            orderHash.current = null;
            setNotice(strings.changed);
            setPage(1);
            if (page === 1) setRefresh(x => x + 1);
          }
          return;
        }
        if (!resp.ok) throw Object.assign(new Error('HTTP ' + resp.status), { rwStatus: resp.status });
        let json;
        try {
          json = await resp.json();
        } catch {
          throw Object.assign(new Error('invalid JSON'), { rwInvalid: true });
        }
        const body = rwArchiveValidatePayload(json, label ? 'he' : 'ru', (page - 1) * pageSize, pageSize);
        if (alive) {
          if (page === 1) orderHash.current = body.feed_order_hash;
          setResult(body);
        }
      } catch (e) {
        // F-04: reader-facing reason, never a raw "HTTP 503" or parser message.
        if (alive) setError(failureText(classifyFailure(e, e?.rwStatus), !!label));
      } finally {
        clearTimeout(timer);
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [page, applied, refresh]);

  const list = Array.isArray(result?.articles) ? result.articles.map(rwNormalizeNewsArticle) : [];
  const total = Number.isInteger(result?.total_events) ? result.total_events : 0;
  const pages = Math.max(1, Math.ceil(total / pageSize)),
    current = Math.min(page, pages),
    begin = (page - 1) * pageSize;
  const setField = (key, value) => setDraft(x => ({ ...x, [key]: value }));
  const apply = () => {
    try {
      const dates = rwArchiveRange(draft, Date.now());
      setFormError(null);
      setNotice(null);
      orderHash.current = null;
      setExpanded(null);
      setPage(1);
      setApplied({ ...draft, ...dates });
    } catch {
      setFormError(strings.badDate);
    }
  };
  const reset = () => {
    setDraft(archiveDefaults());
    setApplied({ ...archiveDefaults(), fromMs: null, toMs: null });
    orderHash.current = null;
    setExpanded(null);
    setFormError(null);
    setNotice(null);
    setPage(1);
  };
  const sortBy = sort => {
    if (applied.sort === sort && draft.sort === sort) return;
    setDraft(x => ({ ...x, sort }));
    setApplied(x => ({ ...x, sort }));
    orderHash.current = null;
    setExpanded(null);
    setPage(1);
    setNotice(null);
  };
  const move = next => {
    if (next < 1 || next > pages) return;
    setExpanded(null);
    setPage(next);
    requestAnimationFrame(() =>
      document.getElementById('all-news')?.scrollIntoView({ block: 'start', behavior: 'auto' }),
    );
  };
  const field = (name, title, element) =>
    h('label', { className: 'rw-archive-field', key: name }, h('span', null, title), element);
  const choose = (name, value, options) =>
    h(
      'select',
      { id: 'rw-archive-' + name, value, onChange: e => setField(name, e.target.value) },
      ...options.map(([v, text]) => h('option', { key: v, value: v }, text)),
    );
  const sourceHints = [
    ...new Set(
      (result?.articles || [])
        .flatMap(x => [x?.source, ...(Array.isArray(x?.sources) ? x.sources.map(s => s?.source) : [])])
        .filter(Boolean),
    ),
  ].slice(0, 25);
  const controls = h(
    'div',
    { className: 'rw-archive-controls' },
    h(
      'div',
      { className: 'rw-archive-sort', role: 'group', 'aria-label': strings.sortLabel },
      h('span', null, strings.sortLabel),
      ...[
        ['latest', strings.latest],
        ['priority', strings.priority],
      ].map(([sort, text]) =>
        h(
          'button',
          {
            type: 'button',
            key: sort,
            'aria-pressed': applied.sort === sort,
            className: applied.sort === sort ? 'active' : '',
            onClick: () => sortBy(sort),
          },
          text,
        ),
      ),
    ),
    h(
      'form',
      {
        className: 'rw-archive-form',
        'aria-label': strings.filterTitle,
        onSubmit: e => {
          e.preventDefault();
          apply();
        },
      },
      h(
        'div',
        { className: 'rw-archive-fields' },
        field(
          'source',
          strings.source,
          h('input', {
            type: 'search',
            value: draft.source,
            list: 'rw-archive-sources',
            placeholder: strings.sourceHint,
            onChange: e => setField('source', e.target.value),
            maxLength: 120,
          }),
        ),
        h(
          'datalist',
          { id: 'rw-archive-sources' },
          ...sourceHints.map(x => h('option', { key: x, value: x })),
        ),
        field(
          'category',
          strings.category,
          choose('category', draft.category, [
            ['', strings.any],
            ['strike', strings.strike],
            ['military', strings.military],
            ['negotiation', strings.negotiation],
            ['diplomacy', strings.diplomacy],
            ['election', strings.election],
            ['governance', strings.governance],
            ['sanctions', strings.sanctions],
            ['statement', strings.statement],
            ['other', strings.other],
          ]),
        ),
        field(
          'verification',
          strings.verification,
          choose('verification', draft.verification, [
            ['', strings.any],
            ['multi_outlet_reporting', strings.multiple],
            ['single_origin_reporting', strings.single],
          ]),
        ),
        field(
          'minPriority',
          strings.importance,
          choose('minPriority', draft.minPriority, [
            ['', strings.any],
            ['4', strings.p4],
            ['7', strings.p7min],
            ['9', strings.p9],
          ]),
        ),
        field(
          'period',
          strings.period,
          choose('period', draft.period, [
            ['all', strings.any],
            ['24h', strings.p24],
            ['72h', strings.p72],
            ['7d', strings.p7],
            ['custom', strings.custom],
          ]),
        ),
        draft.period === 'custom'
          ? h(
              'div',
              { className: 'rw-archive-date-pair' },
              field(
                'fromDate',
                strings.from,
                h('input', {
                  type: 'date',
                  value: draft.fromDate,
                  onChange: e => setField('fromDate', e.target.value),
                }),
              ),
              field(
                'toDate',
                strings.to,
                h('input', {
                  type: 'date',
                  value: draft.toDate,
                  onChange: e => setField('toDate', e.target.value),
                }),
              ),
            )
          : null,
      ),
      formError ? h('p', { className: 'rw-archive-error', role: 'alert' }, formError) : null,
      h(
        'div',
        { className: 'rw-archive-actions' },
        h('button', { type: 'submit' }, strings.apply),
        h('button', { type: 'button', onClick: reset }, strings.reset),
      ),
    ),
  );
  const feedback = loading
    ? h(Loading, { label: strings.loading })
    : error
      ? h(
          'div',
          { className: 'rw-news-page-error', role: 'alert' },
          h('p', null, strings.loadError + error),
          h('button', { type: 'button', onClick: () => setRefresh(x => x + 1) }, strings.retry),
        )
      : list.length
        ? h(NewsMasonry, {
            stories: list,
            expandedId: expanded,
            onToggle: setExpanded,
            read,
            markRead: id => setRead(x => ({ ...x, [id]: true })),
          })
        : t('p', 'hint', strings.empty);
  return h(
    'section',
    { className: 'section rw-news-archive', id: 'all-news' },
    h(Head, {
      title: strings.heading,
      icon: 'newspaper',
      sub: strings.sub,
      right: t(
        'span',
        'hint',
        !loading && !error && total
          ? begin + 1 + '–' + Math.min(begin + pageSize, total) + ' / ' + total
          : '—',
      ),
    }),
    controls,
    notice ? h('p', { className: 'rw-archive-notice', role: 'status' }, notice) : null,
    feedback,
    !loading && !error && pages > 1
      ? h(
          'nav',
          { className: 'rw-pagination', 'aria-label': strings.nav },
          h(
            'button',
            { type: 'button', disabled: current === 1, onClick: () => move(current - 1) },
            strings.prev,
          ),
          h(
            'span',
            { className: 'rw-pagination-count', 'aria-live': 'polite' },
            strings.page + ' ' + current + ' ' + strings.of + ' ' + pages,
          ),
          h(
            'button',
            { type: 'button', disabled: current === pages, onClick: () => move(current + 1) },
            strings.next,
          ),
        )
      : null,
  );
}
