import { FeedState } from '../../components/FeedState/FeedState.js';
import { normalizeCase } from '../../api/normalizeCase.js';
import { UI_HE, h, t, useEffect, useRef, useState } from '../../app/runtime.js';
import { Loading } from '../../components/Loading/Loading.js';
import { NewsArchive } from '../../components/NewsArchive/NewsArchive.js';
import { Intro } from '../../components/PageIntro/Intro.js';
import { Head } from '../../components/SectionHead/Head.js';
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
        accent: 'והקשר.',
        desc: 'לא רק כותרות: תיעוד האירועים, מועד התרחשותם, מקורות הדיווח ומה שאפשר לאמת.',
        meta: 'תיקים במעקב: ',
        head: 'תיקי אירוע',
        sub: 'כל תיק מאחד מקורות ופרסומים. דיווח אינו אימות עצמאי.',
        all: 'הכול',
        security: 'ביטחון',
        aviation: 'תעופה',
        maritime: 'ים',
        other: 'אחר',
        count: ' תיקים',
        missing: 'התרגום לתיק המבוקש אינו זמין כרגע.',
        switchOriginal: 'הצג את הגרסה הרוסית',
        empty: 'אין כרגע תיקים בקטגוריה זו.',
        load: 'טוענים תיקי אירועים…',
        disclaimer: 'סוג התיק וסטטוס המקורות הם הערכה של המידע הזמין, לא אימות של טענות המקורות ולא תחזית.',
      }
    : {
        kicker: 'ДОСЬЕ · ОТ ПЕРВОИСТОЧНИКА ДО ВЫВОДА',
        title: 'События',
        accent: 'и контекст.',
        desc: 'Не просто поток заголовков: история каждого эпизода, дата события, сообщения источников и то, что удалось подтвердить.',
        meta: 'Журнал: ',
        head: 'Досье мониторинга',
        sub: 'Каждая история объединяет наблюдения и публикации. Непроверенные выводы не выдаются за факты.',
        all: 'Все',
        security: 'Безопасность',
        aviation: 'Авиация',
        maritime: 'Море',
        other: 'Прочее',
        count: ' историй',
        missing: 'Запрашиваемое досье отсутствует в этой ленте.',
        switchOriginal: 'Открыть оригинал',
        empty: 'В этой категории пока нет записей.',
        load: 'Загружаем журнал мониторинга…',
        disclaimer:
          'Тип досье и статус источников — оценка доступных сведений, а не проверка заявлений источников и не прогноз.',
      };
  const list = Array.isArray(cases?.stories) ? cases.stories : [];
  const all = list.map(normalizeCase);
  const filtered = all.filter(x => group === 'all' || x.group === group);
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
      meta: cases ? strings.meta + all.length + strings.count : '',
    }),
    h(
      'section',
      { className: 'section' },
      h(Head, {
        title: strings.head,
        sub: strings.sub,
        icon: 'files',
        right: t('span', 'hint', filtered.length + strings.count),
      }),
      h(
        'div',
        { className: 'filters' },
        ...cats.map(([key, label]) =>
          h(
            'button',
            {
              type: 'button',
              key,
              'aria-pressed': group === key,
              className: group === key ? 'active' : '',
              onClick: () => setGroup(key),
            },
            label,
          ),
        ),
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
