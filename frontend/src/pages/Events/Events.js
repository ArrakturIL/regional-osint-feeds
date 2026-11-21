import { FeedState } from '../../components/FeedState/FeedState.js';
import { normalizeCase } from '../../api/normalizeCase.js';
import { UI_HE, h, t, useEffect, useRef, useState } from '../../app/runtime.js';
import { Loading } from '../../components/Loading/Loading.js';
import { NewsArchive } from '../../components/NewsArchive/NewsArchive.js';
import { Intro } from '../../components/PageIntro/Intro.js';
import { Head } from '../../components/SectionHead/Head.js';
import { ruPlural } from '../../utils/ruPlural.js';
import { StoryDossier } from '../../components/StoryDossier/StoryDossier.js';
export function CasesPageV2({ visible, cases, error, feed }) {
  const [group, setGroup] = useState('all'),
    [expanded, setExpanded] = useState(null),
    deepLinkVisited = useRef(null);
  const path = '/' + (UI_HE ? 'he/' : '') + 'events';
  const strings = UI_HE
    ? {
        kicker: 'תיקי אירועים · ממקור למסקנה',
        title: 'אירועים',
        accent: 'והקשר',
        desc: 'לא רק כותרות: תיעוד האירועים, מועד התרחשותם ומי דיווח מה.',
        head: 'תיקי אירוע',
        sub: 'כל תיק מאחד מקורות ופרסומים.',
        all: 'הכול',
        security: 'ביטחון',
        aviation: 'תעופה',
        maritime: 'ים',
        other: 'אחר',
        count: n => (n === 1 ? 'תיק אחד' : n + ' תיקים'),
        missing: 'התרגום לתיק המבוקש אינו זמין כרגע.',
        switchOriginal: 'הצג את הגרסה הרוסית',
        empty: 'אין כרגע תיקים בקטגוריה זו.',
        load: 'טוענים תיקי אירועים…',
        disclaimer: 'אנו מסכמים מקורות ומציינים מי דיווח מה.',
      }
    : {
        kicker: 'ДОСЬЕ · ОТ ПЕРВОИСТОЧНИКА ДО ВЫВОДА',
        title: 'События',
        accent: 'и контекст',
        desc: 'Не просто поток заголовков: история каждого эпизода, дата события и кто что сообщил.',
        head: 'Досье мониторинга',
        sub: 'Каждая история объединяет наблюдения и публикации.',
        all: 'Все',
        security: 'Безопасность',
        aviation: 'Авиация',
        maritime: 'Море',
        other: 'Прочее',
        count: n => n + ' ' + ruPlural(n, ['история', 'истории', 'историй']),
        missing: 'Запрашиваемое досье отсутствует в этой ленте.',
        switchOriginal: 'Открыть оригинал',
        empty: 'В этой категории пока нет записей.',
        load: 'Загружаем журнал мониторинга…',
        disclaimer: 'Мы пересказываем источники и указываем, кто что сообщил.',
      };
  const list = Array.isArray(cases?.stories) ? cases.stories : [];
  const all = list.map(normalizeCase);
  // Owner 21.11: a chip shows how many stories it holds, so a rare group
  // (aviation is often one story) reads as rare rather than broken.
  const inGroup = key => all.filter(x => key === 'all' || x.group === key);
  const filtered = inGroup(group);
  const id = new URLSearchParams(location.search).get('story');
  useEffect(() => {
    if (!id || deepLinkVisited.current === id || !all.some(x => x.id === id)) return;
    deepLinkVisited.current = id;
    setGroup('all');
    setExpanded(id);
    const timer = setTimeout(() => {
      const el = document.getElementById('case-' + id);
      el?.scrollIntoView({ block: 'center', behavior: 'auto' });
      el?.focus({ preventScroll: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [cases, id]);
  const cats = [
    ['all', strings.all],
    ['security', strings.security],
    ['aviation', strings.aviation],
    ['maritime', strings.maritime],
    ['other', strings.other],
  ];
  return h(
    'div',
    { className: 'rw-page', hidden: !visible, id: 'events-page' },
    h(Intro, {
      kicker: strings.kicker,
      title: strings.title,
      accent: strings.accent,
      desc: strings.desc,
    }),
    h(
      'section',
      { className: 'section' },
      h(Head, {
        title: strings.head,
        sub: strings.sub,
        icon: 'files',
        right: t('span', 'hint', strings.count(filtered.length)),
      }),
      h(
        'div',
        { className: 'filters' },
        ...cats.map(([key, label]) => {
          const n = inGroup(key).length;
          return h(
            'button',
            {
              type: 'button',
              key,
              'aria-pressed': group === key,
              className: (group === key ? 'active' : '') + (cases && !n ? ' rw-filter-empty' : ''),
              disabled: !!cases && !n && group !== key,
              onClick: () => setGroup(key),
            },
            label,
            cases ? h('b', { className: 'rw-filter-count' }, String(n)) : null,
          );
        }),
      ),
      cases && error ? h(FeedState, { feed }) : null,
      id && cases && !all.some(s => s.id === id)
        ? h(
            'p',
            { className: 'rw-he-notice', role: 'status' },
            strings.missing,
            UI_HE
              ? h('a', { href: '/events?story=' + encodeURIComponent(id) }, strings.switchOriginal)
              : null,
          )
        : null,
      cases
        ? h(
            'div',
            { className: 'rw-dossier-list' },
            ...filtered.map(story =>
              h(StoryDossier, { key: story.id, story, open: expanded === story.id, onToggle: setExpanded }),
            ),
          )
        : error
          ? h(FeedState, { feed })
          : h(Loading, { label: strings.load }),
      cases && !filtered.length ? t('p', 'hint', strings.empty) : null,
    ),
    h(NewsArchive, {}),
    t('p', 'rw-fineprint', strings.disclaimer),
  );
}
