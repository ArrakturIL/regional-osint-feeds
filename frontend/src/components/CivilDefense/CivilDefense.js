import { UI_HE, h, t } from '../../app/runtime.js';
import { External } from '../External/External.js';
// Home Front Command links on the overview (owner 21.11, variant A): safety
// first and on the home page, not inside «Данные». We do not relay live alerts.
export function CivilDefense() {
  const L = UI_HE
    ? {
        head: 'פיקוד העורף',
        note: 'אין במערכת חיבור ישיר להתרעות בזמן אמת. התרעות — רק מהמקורות הרשמיים:',
        oref: 'פיקוד העורף',
        history: 'היסטוריית התרעות',
        notices: 'הודעות רשמיות',
      }
    : {
        head: 'Служба тыла',
        note: 'Действующие тревоги мы не транслируем. Тревоги — только из официальных источников:',
        oref: 'Служба тыла',
        history: 'История предупреждений',
        notices: 'Официальные сообщения',
      };
  return h(
    'section',
    { className: 'rw-civil', 'aria-labelledby': 'rw-civil-head' },
    h('h2', { className: 'rw-top-head', id: 'rw-civil-head' }, L.head),
    t('p', 'rw-civil-note', L.note),
    h(
      'div',
      { className: 'links' },
      h(External, { url: 'https://www.oref.org.il/' }, L.oref + ' ↗'),
      h(External, { url: 'https://alerts-history.oref.org.il/' }, L.history + ' ↗'),
      h(External, { url: 'https://t.me/PikudHaOref_all' }, L.notices + ' ↗'),
    ),
  );
}
