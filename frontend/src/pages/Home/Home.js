import { UI_HE, fmtTime, h, simpleTime, t, useState } from '../../app/runtime.js';
import { Digest } from '../../components/Digest/Digest.js';
import { Editorial } from '../../components/Editorial/Editorial.js';
import { Loading } from '../../components/Loading/Loading.js';
import { GoLink } from '../../components/Navigation/GoLink.js';
import { NewsMasonry } from '../../components/NewsMasonry/NewsMasonry.js';
import { HomeHero } from '../../components/HomeHero/HomeHero.js';
import { FeedState } from '../../components/FeedState/FeedState.js';
import { Head } from '../../components/SectionHead/Head.js';
import { StoryTeaser } from '../../components/StoryTeaser/StoryTeaser.js';
import { UiIcon } from '../../components/UiIcon/UiIcon.js';
export function HomeV2({ visible, overview, news, cases, go, errors, feeds }) {
  const [expandedId, setExpandedId] = useState(null);
  const [read, setRead] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rw-react-read-v1') || '{}');
    } catch {
      return {};
    }
  });
  const readIt = id => {
    const next = { ...read, [id]: Date.now() };
    setRead(next);
    try {
      localStorage.setItem(
        'rw-react-read-v1',
        JSON.stringify(
          Object.fromEntries(
            Object.entries(next)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 100),
          ),
        ),
      );
    } catch {}
  };
  const stories = (Array.isArray(news?.stories) ? news.stories : []).slice(0, 6);
  const featured = Array.isArray(cases?.stories) ? cases.stories.slice(0, 3) : [];
  const toEvents = (UI_HE ? '/he' : '') + '/events',
    toFeed = toEvents + '#all-news',
    toData = (UI_HE ? '/he' : '') + '/data';
  const labels = UI_HE
    ? {
        kicker: 'סקירה אזורית / מודיעין ממקורות גלויים',
        title: 'תמונת מצב',
        accent: 'באזור.',
        desc: 'מה קרה, מה השתנה ולמה זה חשוב. חדשות, מסמכים רשמיים ופרשנות מוצגים בנפרד.',
        stamp: 'ניתוח אחרון',
        top: 'עיקרי הבדיקה האחרונה',
        pending: 'ממתינים לניתוח',
        assessment: 'תמונת מצב ממקורות פתוחים',
        assessmentDesc: 'הערכת המצב המפורטת בעברית עדיין אינה זמינה. ניתן לבדוק את מקורות הנתונים.',
        analysis: 'ניתוח: ',
        compared: 'נבדקו המקורות הזמינים',
        notCompared: 'לא ניתן היה להשוות לבדיקה הקודמת: אין נתונים בני השוואה',
        featured: 'הסיפורים המרכזיים',
        featuredSub: 'אירועים מתפתחים: מה ידוע ומה עדיין לא ברור',
        allEvents: 'לכל האירועים ←',
        awaitCases: 'ממתינים לתיקי אירועים מתורגמים…',
        onAir: 'בשידור',
        onAirSub: 'עד שש ידיעות אחרונות בעברית.',
        fullFeed: 'לכל העדכונים ←',
        awaitNews: 'טוענים ידיעות בעברית…',
        noNews: 'אין כרגע ידיעות מוכנות בעברית.',
        fine: 'עדכון ה-RSS מתבצע מדי 5 דקות. זמן פרסום הידיעה שונה ממועד קליטתה במערכת.',
        how: 'כיצד פועל המעקב',
        howText: 'תמונת המצב מבוססת על מקורות גלויים. אפשר לבדוק את מגבלות הנתונים ואת שיטת העבודה.',
        method: 'נתונים ומתודולוגיה ←',
      }
    : {
        kicker: 'РЕГИОНАЛЬНЫЙ ОБЗОР / OPEN SOURCE INTELLIGENCE',
        title: 'Обстановка',
        accent: 'в регионе.',
        desc: 'Что произошло, что изменилось и почему это важно. Новости, официальные документы и аналитика — отдельно друг от друга.',
        stamp: 'ПОСЛЕДНИЙ АНАЛИЗ',
        top: 'ГЛАВНОЕ ИЗ ПОСЛЕДНЕГО АНАЛИЗА',
        pending: 'АНАЛИЗ ОЖИДАЕТСЯ',
        assessment: 'Загружаем аналитическую оценку',
        assessmentDesc: 'Получаем последнюю оценку мониторинга.',
        analysis: 'Анализ: ',
        compared: 'Последнее сравнение выполнено по доступным источникам',
        notCompared: 'Сравнить с прошлой проверкой не удалось: нет сопоставимых данных',
        featured: 'Главные истории',
        featuredSub: 'Развивающиеся темы, в которых отдельно указано, что известно и что остаётся неясным',
        allEvents: 'Все события →',
        awaitCases: 'Формируем досье из наблюдений и источников…',
        onAir: 'В эфире',
        onAirSub:
          'Свежие русскоязычные публикации. Комментарий добавляется лишь там, где помогает понять новость.',
        fullFeed: 'Вся лента →',
        awaitNews: 'Получаем свежие публикации…',
        noNews: 'Пока нет публикаций.',
        fine: 'Проверка RSS — каждые 5 минут. Дата публикации указана отдельно от времени, когда запись получила система.',
        how: 'Как работает мониторинг',
        howText:
          'Текущая картина строится по открытым источникам. Полноту данных, методологию и технические ограничения можно проверить отдельно.',
        method: 'Данные и методология →',
      };
  // Q4 (QA 19.11): say "compared" only when /api/changes actually compared
  // two checks; before, the line was printed unconditionally next to
  // "analysis unavailable".
  const digestState = cases?.digestState;
  const comparedLabel =
    !cases || digestState === 'loading' || digestState === 'error'
      ? null
      : Number(cases.sourceComparable) > 0 && digestState !== 'insufficient_comparison'
        ? labels.compared
        : labels.notCompared;
  return h(
    'div',
    { className: 'rw-page', hidden: !visible, id: 'overview' },
    h(HomeHero, { stories: news?.stories }),
    h(
      'section',
      { className: 'rw-situation' },
      h(
        'div',
        { className: 'rw-situation-top' },
        t('span', 'kicker', labels.top),
        t(
          'span',
          'badge' + (overview?.analysis?.state === 'attention' ? ' alert' : ''),
          UI_HE
            ? overview?.analysis?.state === 'attention'
              ? 'דורש תשומת לב'
              : overview?.analysis?.state === 'normal'
                ? 'ללא התרעות חדשות'
                : overview?.analysis?.state === 'partial'
                  ? 'ניתוח חלקי'
                  : 'ממתינים להערכה'
            : overview?.analysis?.badge || labels.pending,
        ),
      ),
      t(
        'h2',
        null,
        UI_HE
          ? overview?.analysis?.state === 'normal'
            ? 'לא זוהו התרעות חדשות'
            : labels.assessment
          : overview?.analysis?.title || labels.assessment,
      ),
      t(
        'p',
        null,
        UI_HE
          ? overview?.analysis?.state === 'normal'
            ? 'בבדיקה האחרונה לא זוהו התרעות חדשות במקורות הזמינים. היעדר התראה אינו הוכחה להיעדר אירוע.'
            : labels.assessmentDesc
          : overview?.analysis?.description || labels.assessmentDesc,
      ),
      h(
        'div',
        { className: 'rw-situation-bottom' },
        t('span', null, labels.analysis + fmtTime(overview?.analysis?.time)),
        comparedLabel && t('span', null, comparedLabel),
      ),
    ),
    h('div', { className: 'rw-editorial-lead' }, h(Editorial, { notes: news?.editorials })),
    h(Digest, { cases }),
    h(
      'section',
      { className: 'section' },
      h(Head, {
        title: labels.featured,
        sub: labels.featuredSub,
        icon: 'files',
        right: h(GoLink, { to: toEvents, go, className: 'rw-more-link' }, labels.allEvents),
      }),
      featured.length
        ? h(
            'div',
            { className: 'rw-feature-grid' },
            ...featured.map(story => h(StoryTeaser, { key: story.id, story, go })),
          )
        : errors?.cases
          ? h(FeedState, { feed: feeds?.cases })
          : !cases
            ? h(Loading, { label: labels.awaitCases })
            : t('p', 'hint', UI_HE ? 'אין כרגע תיקי מעקב.' : 'Пока нет досье мониторинга.'),
    ),
    h(
      'div',
      { className: 'rw-home-news-editorial' },
      h(
        'section',
        { className: 'section rw-home-feed', id: 'on-air' },
        h(Head, {
          title: labels.onAir,
          sub: labels.onAirSub,
          icon: 'pulse',
          right: h(GoLink, { to: toFeed, go, className: 'rw-more-link' }, labels.fullFeed),
        }),
        errors?.news ? h(FeedState, { feed: feeds?.news }) : null,
        stories.length
          ? h(NewsMasonry, { stories, expandedId, onToggle: setExpandedId, read, markRead: readIt })
          : errors?.news
            ? null
            : !news || news.feedPending
              ? h(Loading, { label: labels.awaitNews })
              : t('p', 'hint', labels.noNews),
        t('p', 'rw-fineprint', labels.fine),
      ),
      null,
    ),
    h(
      'section',
      { className: 'section rw-service-line' },
      h(
        'div',
        null,
        h(
          'div',
          { className: 'rw-title-with-icon' },
          h(UiIcon, { name: 'database' }),
          t('strong', null, labels.how),
        ),
        t('p', null, labels.howText),
      ),
      h(GoLink, { to: toData, go, className: 'rw-more-link' }, labels.method),
    ),
  );
}
