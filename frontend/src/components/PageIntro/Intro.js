import { h, t } from '../../app/runtime.js';
export function Intro({ kicker, title, accent, desc, meta, stamp }) {
  return h(
    'section',
    { className: 'page-intro' },
    h(
      'div',
      null,
      t('div', 'kicker', kicker),
      h('h1', { className: 'page-title' }, title, h('br'), h('em', null, accent)),
      t('p', null, desc),
    ),
    stamp
      ? h(
          'div',
          { className: 'stamp' },
          t('span', null, stamp.label),
          t('b', null, stamp.main),
          t('small', null, stamp.sub),
        )
      : meta
        ? t('div', 'hint', meta)
        : null,
  );
}
