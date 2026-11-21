import { UI_HE, h, t, useEffect, useRef, useState } from '../../app/runtime.js';
import { UiIcon } from '../UiIcon/UiIcon.js';
// Q6 (QA 19.11): the post id is the segment after "analysts", not the last
// segment — "/he/analysts/" used to switch to "/analysts/analysts".
export function analystPostSuffix(pathname) {
  const parts = String(pathname || '')
    .split('/')
    .filter(Boolean);
  const post = parts[parts.indexOf('analysts') + 1];
  return parts.includes('analysts') && post ? '/' + encodeURIComponent(post) : '';
}
export function GlobalHeader({ active, overview, go }) {
  const [menu, setMenu] = useState(false),
    [panel, setPanel] = useState(false);
  const modalRef = useRef(null),
    triggerRef = useRef(null);
  const he = UI_HE,
    section =
      active === '/events'
        ? 'events'
        : active === '/data'
          ? 'data'
          : active === '/analysts'
            ? 'analysts'
            : '';
  const suffix = section === 'analysts' ? analystPostSuffix(location.pathname) : '';
  const href = (locale, slug = section, preserve = true) => {
    const path =
      (locale === 'he' ? '/he' : '') +
      (slug ? '/' + slug + (slug === 'analysts' && preserve ? suffix : '') : '/');
    return path + (preserve && slug === section ? location.search + location.hash : '');
  };
  const names = [
    ['', 'Обстановка', 'תמונת מצב'],
    ['events', 'События', 'אירועים'],
    ['data', 'Данные', 'נתונים'],
    ['analysts', 'Аналитики', 'פרשנים'],
  ];
  const list = Array.isArray(overview?.sources) ? overview.sources : [];
  const good = overview?.available,
    number = overview?.total;
  const status = Number.isFinite(good) && Number.isFinite(number) ? good + '/' + number : '—';
  useEffect(() => {
    const node = modalRef.current;
    if (panel && node && !node.open) node.showModal();
    return () => {
      if (node?.open) node.close();
    };
  }, [panel]);
  const store = locale => {
    try {
      localStorage.setItem('rw-language', locale);
    } catch {}
  };
  return h(
    'header',
    { className: 'rw-header rw-global-header', 'data-site-nav': '1' },
    h('a', { className: 'rw-skip-link', href: '#main-content' }, he ? 'דלג לתוכן' : 'К содержимому'),
    h(
      'a',
      { className: 'brand', href: href(he ? 'he' : 'ru', '', false) },
      h(
        'svg',
        { className: 'rw-brand-mark', viewBox: '0 0 30 30', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M15 2 L28 9.5 L28 20.5 L15 28 L2 20.5 L2 9.5 Z', fill: 'none', stroke: 'currentColor', strokeWidth: '1.2' }),
        h('circle', { cx: '15', cy: '15', r: '3', fill: 'currentColor' }),
      ),
      t('strong', null, 'REGIONAL WATCH'),
    ),
    h(
      'div',
      { className: 'rw-site-actions' },
      h(
        'button',
        {
          type: 'button',
          ref: triggerRef,
          className: 'rw-site-source',
          onClick: () => setPanel(true),
          'aria-haspopup': 'dialog',
          'aria-label': he ? 'מצב מקורות' : 'Состояние источников',
        },
        h('span', { className: 'rw-source-label-full' }, he ? 'מקורות' : 'Источники'),
        h('span', { className: 'rw-source-label-short' }, he ? 'מקורות' : 'Ист.'),
        h('bdi', { className: 'rw-site-source-count', dir: 'ltr' }, status),
      ),
      h(
        'div',
        { className: 'rw-site-language', dir: 'ltr', 'aria-label': he ? 'בחירת שפה' : 'Выбор языка' },
        ...[
          ['ru', 'RU'],
          ['he', 'עברית'],
        ].map(([locale, title]) =>
          h(
            'a',
            {
              key: locale,
              href: href(locale),
              lang: locale,
              className: (locale === 'he') === he ? 'active' : undefined,
              'aria-current': (locale === 'he') === he ? 'page' : undefined,
              onClick: () => store(locale),
            },
            title,
          ),
        ),
      ),
      // Owner's service page (owner 21.11: at the top, the same on every page).
      h(
        'a',
        {
          className: 'rw-ops-link',
          href: '/ops',
          title: he ? 'לוח בקרה' : 'Служебный пульт',
          'aria-label': he ? 'לוח בקרה' : 'Служебный пульт',
        },
        h(UiIcon, { name: 'gauge', size: 18 }),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'rw-site-menu',
          'aria-label': he ? 'פתיחת תפריט' : 'Открыть меню',
          'aria-expanded': menu,
          'aria-controls': 'rw-site-links',
          onClick: () => setMenu(x => !x),
        },
        menu ? '×' : '☰',
      ),
    ),
    h(
      'nav',
      {
        className: 'rw-site-links',
        id: 'rw-site-links',
        'data-open': menu ? 'true' : 'false',
        'aria-label': he ? 'ניווט ראשי' : 'Разделы сайта',
      },
      ...names.map(([slug, ru, iv]) =>
        h(
          'a',
          {
            key: slug,
            href: href(he ? 'he' : 'ru', slug, false),
            onClick: e => {
              if (!go || e.button || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
              e.preventDefault();
              setMenu(false);
              go(href(he ? 'he' : 'ru', slug, false));
            },
            className: section === slug ? 'active' : undefined,
            'aria-current': section === slug ? 'page' : undefined,
          },
          h(UiIcon, {
            name:
              slug === 'events'
                ? 'files'
                : slug === 'data'
                  ? 'database'
                  : slug === 'analysts'
                    ? 'users'
                    : 'pulse',
            size: 17,
          }),
          he ? iv : ru,
        ),
      ),
    ),
    panel
      ? h(
          'dialog',
          {
            ref: modalRef,
            className: 'rw-dlg',
            'aria-labelledby': 'rw-dialog-title',
            onClose: () => {
              setPanel(false);
              requestAnimationFrame(() => triggerRef.current?.focus());
            },
          },
          h(
            'div',
            { className: 'rw-dlg-head' },
            h('h2', { id: 'rw-dialog-title' }, he ? 'מצב מקורות' : 'Состояние источников'),
            h(
              'button',
              {
                type: 'button',
                className: 'rw-dlg-close',
                onClick: () => {
                  setPanel(false);
                  requestAnimationFrame(() => triggerRef.current?.focus());
                },
              },
              he ? 'סגירה' : 'Закрыть',
            ),
          ),
          h('bdi', { className: 'rw-dlg-counter', dir: 'ltr' }, status),
          list.length
            ? h(
                'div',
                { className: 'rw-dlg-items' },
                ...list.map((x, i) =>
                  h(
                    'div',
                    { className: 'rw-dlg-row', key: x.id || i },
                    h('span', null, (UI_HE ? x.label_he : x.label) || x.id || '—'),
                    h(
                      'span',
                      { className: 'rw-dlg-state' },
                      x.state === 'ok'
                        ? he
                          ? 'תקין'
                          : 'Работает'
                        : x.state === 'partial'
                          ? he
                            ? 'חלקי'
                            : 'Частично'
                          : x.state === 'error'
                            ? he
                              ? 'שגיאה'
                              : 'Ошибка'
                            : x.state === 'disabled'
                              ? he
                                ? 'מושבת זמנית'
                                : 'Временно отключён'
                              : x.state || '—',
                    ),
                  ),
                ),
              )
            : t('p', 'hint', he ? 'אין כרגע פרטי מקור זמינים.' : 'Список источников пока недоступен.'),
          h(
            'a',
            { className: 'rw-dlg-more', href: href(he ? 'he' : 'ru', 'data') },
            he ? 'פרטים ומגבלות נתונים' : 'Подробнее о данных и ограничениях',
          ),
        )
      : null,
  );
}
