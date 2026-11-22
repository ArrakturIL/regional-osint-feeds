import { UI_HE, fmtTime, h, t, useEffect, useState } from '../../app/runtime.js';
import { External } from '../../components/External/External.js';
import { Intro } from '../../components/PageIntro/Intro.js';
import { Head } from '../../components/SectionHead/Head.js';
import { useFeed } from '../../hooks/useFeed.js';
import { HE_ITEMS } from '../../i18n/meta.js';
export function AnalystShared({ heProfiles }) {
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [author, setAuthor] = useState(() => new URLSearchParams(location.search).get('author') || ''),
    [extra, setExtra] = useState({ key: '', posts: [], more: null, busy: false }),
    [refresh, setRefresh] = useState(0);
  const parts = location.pathname.split('/').filter(Boolean),
    idx = parts.indexOf('analysts'),
    slug = idx < 0 ? null : parts[idx + 1] || null,
    he = UI_HE;
  // 22.11: the list is asked from the server with the author filter and the
  // search, so both reach every publication, not only the first page. Hebrew
  // search stays in the browser (the stored text is Russian).
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);
  const listUrl =
    '/api/analyst-posts?lang=' +
    (he ? 'he' : 'ru') +
    (author ? '&author=' + encodeURIComponent(author) : '') +
    (!he && query ? '&q=' + encodeURIComponent(query) : '');
  const posts = useFeed(listUrl + '&refresh=' + refresh, 120000, !slug);
  const pickAuthor = id => {
    const next = author === id ? '' : id;
    setAuthor(next);
    const u = new URL(location.href);
    if (next) u.searchParams.set('author', next);
    else u.searchParams.delete('author');
    history.replaceState(history.state, '', u);
  };
  const firstPage = Array.isArray(posts.value?.posts) ? posts.value.posts : HE_ITEMS(posts.value);
  const pages = extra.key === listUrl ? extra : { key: listUrl, posts: [], more: null, busy: false };
  const hasMore = pages.more === null ? Boolean(posts.value?.has_more) : pages.more;
  const loadMore = async () => {
    if (pages.busy) return;
    setExtra({ ...pages, busy: true });
    try {
      const r = await fetch(listUrl + '&offset=' + (firstPage.length + pages.posts.length), {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const j = await r.json();
      const got = Array.isArray(j?.posts) ? j.posts : HE_ITEMS(j);
      setExtra({ key: listUrl, posts: [...pages.posts, ...got], more: Boolean(j?.has_more), busy: false });
    } catch {
      setExtra({ ...pages, busy: false });
    }
  };
  const people = useFeed('/api/analysts?lang=ru&refresh=' + refresh, 300000, !he && !slug);
  const detail = useFeed(
    '/api/analyst-posts/' +
      encodeURIComponent(slug || 'none') +
      '?lang=' +
      (he ? 'he' : 'ru') +
      '&refresh=' +
      refresh,
    120000,
    !!slug,
  );
  const raw = he ? [...firstPage, ...pages.posts] : [];
  const list = slug
    ? detail.value?.id === slug
      ? [detail.value]
      : []
    : he
      ? raw.map(x => ({
          ...x,
          title: x.title || x.headline || '',
          excerpt: x.excerpt || x.summary || x.body || '',
        }))
      : [...firstPage, ...pages.posts];
  const profiles = he
    ? Array.isArray(heProfiles?.value?.analysts)
      ? heProfiles.value.analysts.map(x => ({
          ...x,
          title: x.title || x.display_name || '',
          body: x.body || x.description || '',
          excerpt: x.excerpt || x.description || '',
        }))
      : HE_ITEMS(heProfiles?.value)
    : Array.isArray(people.value?.analysts)
      ? people.value.analysts
      : [];
  const names = new Map(profiles.map(x => [x.id, he ? x.title : x.display_name]));
  const L = he
    ? {
        kicker: 'מקורות פתוחים / דברי פרשנים',
        title: 'פרשנים',
        accent: 'וניתוחים',
        desc: 'חומרי פרשנים, עם ציון שם הכותב.',
        posts: 'פרסומי פרשנים',
        sub: 'כל חומר מתפרסם עם ציון המחבר',
        profiles: 'מקורות ופרשנים',
        all: 'כולם',
        more: 'עוד פרסומים',
        nothing: 'לא נמצאו פרסומים.',
        search: 'חיפוש בפרסומים',
        refresh: 'רענון',
        back: 'לכל הפרסומים',
        original: 'למקור',
        open: 'פתיחת פרסום',
        empty: 'אין כרגע פרסומים מוכנים בעברית.',
        pending: ' פרסומים ממתינים לתרגום או לבדיקה.',
        notFound: 'הפרסום המבוקש לא נמצא.',
        ru: 'לגרסה הרוסית',
        error: 'חלק מהמידע אינו זמין.',
        loading: 'הפרסומים נטענים…',
        published: 'פורסם באתר',
        detail: 'פרסום פרשן',
      }
    : {
        kicker: 'РЕДАКЦИОННАЯ АНАЛИТИКА / ОТКРЫТЫЕ ИСТОЧНИКИ',
        title: 'Аналитики',
        accent: 'и публикации',
        desc: 'Материалы аналитиков с указанием автора.',
        posts: 'Лента аналитиков',
        sub: 'Материалы публикуются с указанием авторства',
        profiles: 'Источники и авторы',
        all: 'Все',
        more: 'Показать ещё',
        nothing: 'Ничего не нашлось.',
        search: 'Поиск по публикациям',
        refresh: 'Обновить',
        back: 'К списку аналитиков',
        original: 'Первоисточник',
        open: 'Открыть публикацию',
        empty: 'Публикаций пока нет.',
        pending: ' материалов ожидают обработки.',
        notFound: 'Публикация не найдена.',
        ru: 'Русская версия',
        error: 'Часть данных временно недоступна.',
        loading: 'Загружаем публикации…',
        published: 'На сайте',
        detail: 'Публикация аналитика',
      };
  const normalized = list
    .map(x => ({
      id: x.id,
      title: x.title || x.headline || '',
      summary: x.excerpt || x.summary || x.body || '',
      author:
        (typeof x.analyst === 'string' ? x.analyst : x.analyst?.display_name) ||
        names.get(x.analyst_id) ||
        x.author ||
        x.source ||
        (he ? 'פרשן' : 'Аналитический источник'),
      url: x.original_url || x.source_url || x.url,
      published: x.published_at_ms || x.time,
      originalPublished: x.original_published_at_ms || null,
      content_language: x.content_language,
      translation_status: x.translation_status,
    }))
    .filter(
      x =>
        (!slug || slug === x.id) &&
        (!he || (x.title + ' ' + x.summary + ' ' + x.author).toLocaleLowerCase().includes(search.toLocaleLowerCase())),
    );
  const base = he ? '/he/analysts' : '/analysts';
  // 22.11 (owner): authors on top as compact chips; a tap filters the list.
  const initials = name =>
    String(name || '')
      .replace(/[«»"]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toLocaleUpperCase();
  const authorChips = () => {
    const chosen = profiles.find(x => x.id === author);
    const chip = (id, name, count) =>
      h(
        'button',
        {
          type: 'button',
          key: id || 'all',
          className: 'rw-author-chip' + ((id || '') === author ? ' on' : ''),
          'aria-pressed': (id || '') === author,
          onClick: () => pickAuthor(id || ''),
        },
        id ? h('span', { className: 'rw-author-ini', 'aria-hidden': 'true' }, initials(name)) : null,
        h('span', { className: 'rw-author-name' }, name),
        typeof count === 'number' ? h('span', { className: 'rw-author-n' }, count) : null,
      );
    return h(
      'div',
      { className: 'rw-authors' },
      h(
        'div',
        { className: 'rw-author-row', role: 'group', 'aria-label': L.profiles },
        chip('', L.all),
        ...[...profiles]
          .sort((a, b) => (b.posts || 0) - (a.posts || 0))
          .map(x => chip(x.id, he ? x.title : x.display_name, x.posts)),
      ),
      chosen ? t('p', 'rw-author-desc', he ? chosen.body || chosen.excerpt : chosen.description || '') : null,
    );
  };
  const entry = x =>
    h(
      'article',
      { className: 'rw-analyst-article', key: x.id },
      h('div', { className: 'rw-analyst-meta' }, t('span', 'kicker', x.author)),
      h(
        'h3',
        { lang: x.content_language || undefined, dir: 'auto' },
        slug ? x.title : h('a', { href: base + '/' + encodeURIComponent(x.id) }, x.title),
      ),
      he && x.content_language !== 'he'
        ? h('small', { className: 'rw-translation-state' }, 'תרגום ממתין — מוצג נוסח המקור')
        : null,
      t('p', null, x.summary),
      // 21.11 (concept E): both times on one mono line.
      x.originalPublished || x.published
        ? h(
            'p',
            { className: 'rw-analyst-time' },
            x.originalPublished
              ? h('span', null, (he ? 'במקור ' : 'У источника ') + fmtTime(x.originalPublished))
              : null,
            x.published ? h('span', null, L.published + ' ' + fmtTime(x.published)) : null,
          )
        : null,
      h(
        'div',
        { className: 'rw-analyst-links' },
        x.url ? h(External, { url: x.url }, L.original + ' ↗') : null,
        !slug ? h('a', { href: base + '/' + encodeURIComponent(x.id) }, L.open) : null,
      ),
    );
  return h(
    'div',
    { className: 'rw-page' },
    h(Intro, { kicker: L.kicker, title: L.title, accent: L.accent, desc: L.desc }),
    h(
      'section',
      { className: 'section' },
      h(Head, { title: slug ? L.detail : L.posts, sub: L.sub, icon: 'users' }),
      slug ? null : authorChips(),
      slug
        ? h('a', { className: 'rw-more-link', href: base }, L.back)
        : h(
            'div',
            { className: 'rw-analyst-controls' },
            h('input', {
              type: 'search',
              value: search,
              placeholder: L.search,
              onChange: e => setSearch(e.target.value),
              'aria-label': L.search,
            }),
            h('button', { type: 'button', onClick: () => setRefresh(x => x + 1) }, L.refresh),
          ),
      (
        slug
          ? detail.error && !/HTTP 404/.test(detail.error)
          : he
            ? posts.error || heProfiles?.error
            : posts.error || people.error
      )
        ? h(
            'div',
            { className: 'rw-analyst-error', role: 'alert' },
            L.error,
            slug
              ? h(
                  'button',
                  { type: 'button', onClick: () => setRefresh(x => x + 1) },
                  he ? 'נסו שוב' : 'Повторить',
                )
              : null,
          )
        : null,
      he && !slug && raw.some(x => x.content_language !== 'he')
        ? t('p', 'rw-analyst-notice', raw.filter(x => x.content_language !== 'he').length + L.pending)
        : null,
      normalized.length
        ? h(
            'div',
            null,
            h('div', { className: 'rw-analyst-grid' }, ...normalized.map(entry)),
            !slug && hasMore
              ? h(
                  'button',
                  { type: 'button', className: 'rw-analyst-more', onClick: loadMore, disabled: pages.busy },
                  pages.busy ? L.loading : L.more,
                )
              : null,
          )
        : h(
            'div',
            { className: 'rw-analyst-empty', role: 'status' },
            slug
              ? detail.error
                ? /HTTP 404/.test(detail.error)
                  ? L.notFound
                  : L.error
                : detail.value
                  ? L.notFound
                  : L.loading
              : posts.value
                ? query || search || author
                  ? L.nothing
                  : L.empty
                : L.loading,
          ),
    ),
  );
}
