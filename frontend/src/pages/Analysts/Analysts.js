import { UI_HE, fmtTime, h, t, useState } from '../../app/runtime.js';
import { External } from '../../components/External/External.js';
import { Intro } from '../../components/PageIntro/Intro.js';
import { Head } from '../../components/SectionHead/Head.js';
import { useFeed } from '../../hooks/useFeed.js';
import { HE_ITEMS } from '../../i18n/meta.js';
export function AnalystShared({ hePosts, heProfiles }) {
  const [search, setSearch] = useState(''),
    [refresh, setRefresh] = useState(0);
  const parts = location.pathname.split('/').filter(Boolean),
    idx = parts.indexOf('analysts'),
    slug = idx < 0 ? null : parts[idx + 1] || null,
    he = UI_HE;
  const posts = useFeed('/api/analyst-posts?lang=ru&refresh=' + refresh, 120000, !he && !slug);
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
  const raw = he
    ? Array.isArray(hePosts?.value?.posts)
      ? hePosts.value.posts
      : Array.isArray(hePosts?.value?.items)
        ? hePosts.value.items
        : []
    : [];
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
      : Array.isArray(posts.value?.posts)
        ? posts.value.posts
        : [];
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
        (x.title + ' ' + x.summary + ' ' + x.author).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    );
  const base = he ? '/he/analysts' : '/analysts';
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
            ? hePosts?.error || heProfiles?.error
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
        ? h('div', { className: 'rw-analyst-grid' }, ...normalized.map(entry))
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
              : hePosts?.value || posts.value
                ? L.empty
                : L.loading,
          ),
    ),
    !slug
      ? h(
          'section',
          { className: 'section rw-analyst-profiles' },
          h(Head, { title: L.profiles, icon: 'users' }),
          h(
            'div',
            { className: 'rw-analyst-grid' },
            ...profiles.map(x =>
              h(
                'article',
                { className: 'rw-analyst-article', key: x.id },
                t('h3', null, he ? x.title : x.display_name),
                t('p', null, he ? x.body || x.excerpt : x.description || ''),
              ),
            ),
          ),
        )
      : null,
  );
}
