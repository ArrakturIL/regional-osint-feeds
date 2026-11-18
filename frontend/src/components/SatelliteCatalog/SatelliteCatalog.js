import { h, t, useEffect, useState } from '../../app/runtime.js';
import { External } from '../External/External.js';
import { Head } from '../SectionHead/Head.js';
export function SatelliteCatalog() {
  const [state, setState] = useState({ loading: true, report: null });
  useEffect(() => {
    let alive = true;
    let controller = new AbortController();
    async function reload() {
      try {
        const res = await fetch('/api/rw/satellite', { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw Error('satellite ' + res.status);
        const r = await res.json();
        if (alive) setState({ loading: false, report: r });
      } catch (e) {
        if (alive && e.name !== 'AbortError') setState({ loading: false, report: null });
      }
    }
    reload();
    const timer = setInterval(() => {
      if (!document.hidden) reload();
    }, 300000);
    return () => {
      alive = false;
      clearInterval(timer);
      controller.abort();
    };
  }, []);
  const r = state.report;
  if (!r || r.display_policy !== 'show' || r.has_publishable_content === false) return null;
  const entries = (r.signals || []).filter(
    x =>
      x.is_live === true ||
      x.confirmation_status === 'verified' ||
      x.confidence === 'corroborated' ||
      x.confidence === 'official_verified',
  );
  if (!entries.length) return null;
  return h(
    'section',
    { className: 'section', id: 'satellite' },
    h(Head, {
      title: 'Спутниковые данные',
      sub: 'Только значимые проверенные материалы; сырые радарные отсчёты скрыты',
    }),
    h(
      'div',
      { className: 'rw-relevance-cards' },
      ...entries
        .slice(0, 8)
        .map(x =>
          h(
            'article',
            { className: 'rw-relevance', key: x.id },
            t('span', 'kicker', x.source?.name || 'Спутниковый источник'),
            t('h3', null, x.title),
            t('p', null, x.description),
            t('small', null, x.caveat || 'Содержимое требует сверки с первоисточником.'),
            x.source?.url ? h(External, { url: x.source.url }, 'Первоисточник ↗') : null,
          ),
        ),
    ),
  );
}
