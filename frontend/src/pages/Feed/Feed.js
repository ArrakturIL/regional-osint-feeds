import { UI_HE, h, t, useState } from '../../app/runtime.js';
import { NewsArchive } from '../../components/NewsArchive/NewsArchive.js';
import { OfficialGroup } from '../../components/Official/OfficialGroup.js';
import { Intro } from '../../components/PageIntro/Intro.js';
// «Лента» (owner 21.11, variant A): every publication in time order. Two views
// of one page: outlets (the archive) and official bodies (IDF, CENTCOM, MARAD,
// UKMTO, EASA, FCDO, US State Department).
export function FeedPage({ data, officialPosts }) {
  const [view, setView] = useState(() => (location.hash === '#official' ? 'official' : 'media'));
  const s = UI_HE
    ? {
        kicker: 'כל הפרסומים · לפי סדר הזמן',
        title: 'עדכונים',
        accent: 'שוטפים',
        desc: 'כל מה שדווח, החדש ביותר קודם: כלי תקשורת וגופים רשמיים.',
        media: 'כלי תקשורת',
        official: 'גופים רשמיים',
        origin: 'כותרות של גופים זרים מוצגות בשפת המקור.',
        empty: 'אין כרגע פרסומים.',
        groups: { idf: 'צה״ל', centcom: 'CENTCOM', marad: 'MARAD — אזהרות ימיות', ukmto: 'UKMTO — אזהרות ימיות', easa: 'EASA — אזורי סכסוך', fcdo: 'FCDO — הנחיות נסיעה', state: 'משרד החוץ האמריקאי' },
        fine: 'אנו מציגים את דברי המקור ומציינים מי דיווח מה; דיווח אינו אימות.',
      }
    : {
        kicker: 'Все публикации · по времени',
        title: 'Лента',
        accent: 'публикаций',
        desc: 'Всё, что сообщили, — сначала новое: издания и официальные ведомства.',
        media: 'Издания',
        official: 'Официальные',
        origin: 'Заголовки иностранных ведомств приведены в оригинале.',
        empty: 'Публикаций пока нет.',
        groups: { idf: 'ЦАХАЛ', centcom: 'CENTCOM', marad: 'MARAD — морские предупреждения', ukmto: 'UKMTO — морские предупреждения', easa: 'EASA — зоны конфликтов', fcdo: 'FCDO — рекомендации для поездок', state: 'Госдеп США' },
        fine: 'Мы пересказываем источник и указываем, кто что сообщил; сообщение — не подтверждение.',
      };
  const adv = data?.advisories || {};
  const idf = officialPosts?.items || data?.home || [];
  const groups = [
    ['idf', idf],
    ['centcom', data?.centcom],
    ['marad', data?.marad],
    ['ukmto', adv.ukmto],
    ['easa', adv.easa],
    ['fcdo', adv.fcdo],
    ['state', adv.state],
  ];
  const pick = v => {
    setView(v);
    history.replaceState(history.state, '', location.pathname + location.search + (v === 'official' ? '#official' : ''));
  };
  return h(
    'div',
    { className: 'rw-page', id: 'feed-page' },
    h(Intro, { kicker: s.kicker, title: s.title, accent: s.accent, desc: s.desc }),
    h(
      'div',
      { className: 'filters rw-feed-views', role: 'group' },
      ...[
        ['media', s.media],
        ['official', s.official],
      ].map(([v, label]) =>
        h(
          'button',
          { type: 'button', key: v, 'aria-pressed': view === v, className: view === v ? 'active' : '', onClick: () => pick(v) },
          label,
        ),
      ),
    ),
    view === 'media'
      ? h(NewsArchive, {})
      : h(
          'section',
          { className: 'section', id: 'official' },
          t('p', 'hint', s.origin),
          h(
            'div',
            { className: 'data-grid-2' },
            ...groups.map(([k, items]) => h(OfficialGroup, { key: k, name: s.groups[k], items: items || [], empty: s.empty })),
          ),
        ),
    t('p', 'rw-fineprint', s.fine),
  );
}
