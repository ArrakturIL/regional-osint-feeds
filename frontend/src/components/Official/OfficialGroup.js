import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
import { Card } from '../Card/Card.js';
import { External } from '../External/External.js';
// Official messages, one card per body (owner 21.11, variant A: in «Лента»,
// not in «Данные»). Moved from the Data page unchanged in look.
export function OfficialGroup({ name, items, empty }) {
  const isHe = UI_HE;
  return (
    h(
      Card,
      null,
      h('h3', null, name),
      Array.isArray(items) && items.length
        ? h(
            'div',
            { className: 'rw-data-official-list' },
            ...items.slice(0, 5).map((x, i) => {
              const language = x.content_language || 'en',
                idfofficial = /^https:\/\/t\.me\/idfofficial\//.test(String(x.url || '')),
                pending = idfofficial && language !== (isHe ? 'he' : 'ru');
              return h(
                'article',
                { className: 'rw-official-row', key: x.id || i },
                h('strong', { lang: language, dir: 'auto' }, x.title || name),
                // 21.11 (concept E): time and translation state on one mono line
                // under the title instead of badges inside the title line.
                (() => {
                  const parts = [];
                  if (x.published)
                    parts.push(h('time', { key: 't', dateTime: x.published }, fmtTime(x.published)));
                  if (pending)
                    parts.push(
                      h(
                        'span',
                        { key: 'p', className: 'rw-official-note', role: 'status' },
                        isHe
                          ? language === 'en'
                            ? 'המקור באנגלית · התרגום ממתין'
                            : 'המקור ברוסית · התרגום ממתין'
                          : language === 'en'
                            ? 'Оригинал на английском · перевод ожидается'
                            : 'Оригинал на иврите · перевод ожидается',
                      ),
                    );
                  else if (idfofficial && x.translation_status === 'available')
                    parts.push(
                      h(
                        'span',
                        { key: 'm', className: 'rw-official-note' },
                        isHe
                          ? 'תרגום מכונה · יש לבדוק מול המקור'
                          : 'Автоматический перевод · сверяй с оригиналом',
                      ),
                    );
                  return parts.length ? h('p', { className: 'rw-official-meta' }, ...parts) : null;
                })(),
                x.description ? h('p', { lang: language, dir: 'auto' }, x.description) : null,
                x.url ? h(External, { url: x.url }, isHe ? 'למקור ↗' : 'Первоисточник ↗') : null,
              );
            }),
          )
        : t('p', 'hint', empty),
    ));
}
