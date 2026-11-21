import { UI_HE, h, t } from '../../app/runtime.js';
import { NewsArchive } from '../../components/NewsArchive/NewsArchive.js';
import { Intro } from '../../components/PageIntro/Intro.js';
// «Лента» (owner 21.11, variant A): every publication in time order — the
// archive that used to sit under the dossiers on «События».
export function FeedPage() {
  const s = UI_HE
    ? {
        kicker: 'כל הפרסומים · לפי סדר הזמן',
        title: 'עדכונים',
        accent: 'שוטפים',
        desc: 'כל מה שדווח, החדש ביותר קודם: כלי תקשורת ומקורות רשמיים, עם סינון לפי מקור, נושא וחשיבות.',
        fine: 'אנו מציגים את דברי המקור ומציינים מי דיווח מה; דיווח אינו אימות.',
      }
    : {
        kicker: 'Все публикации · по времени',
        title: 'Лента',
        accent: 'публикаций',
        desc: 'Всё, что сообщили, — сначала новое: издания и официальные источники, с фильтрами по источнику, теме и важности.',
        fine: 'Мы пересказываем источник и указываем, кто что сообщил; сообщение — не подтверждение.',
      };
  return h(
    'div',
    { className: 'rw-page', id: 'feed-page' },
    h(Intro, { kicker: s.kicker, title: s.title, accent: s.accent, desc: s.desc }),
    h(NewsArchive, {}),
    t('p', 'rw-fineprint', s.fine),
  );
}
