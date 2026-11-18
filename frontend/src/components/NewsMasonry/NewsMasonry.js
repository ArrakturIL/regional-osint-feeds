import { h } from '../../app/runtime.js';
import { NewsCard } from '../NewsCard/NewsCard.js';

/** Stable source-order news grid. CSS aligns cards in rows without re-measuring them. */
export function NewsMasonry({ stories, expandedId, onToggle, read, markRead }) {
  return h(
    'div',
    { className: 'news-grid rw-masonry' },
    ...stories.map((x, i) =>
      h(
        'div',
        { className: 'news-slot', key: x.id || x.url || i },
        h(NewsCard, {
          item: x,
          open: expandedId === (x.id || x.url || x.title),
          onToggle,
          read: !!read[x.id || x.url || x.title],
          markRead,
        }),
      ),
    ),
  );
}
