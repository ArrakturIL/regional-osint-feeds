import { h, t } from '../../app/runtime.js';
import { External } from '../External/External.js';
import {
  rwMarketChange,
  rwMarketDate,
  rwMarketDeadline,
  rwMarketMoney,
  rwMarketPct,
  rwMarketTitle,
} from '../../utils/marketSeries.js';
import { ruPlural } from '../../utils/ruPlural.js';

// STATUS #10: one Polymarket question per card. A series (same question by several
// deadlines, or several people) is one card with a row per variant.
const RW_MARKET_TEXT = {
  ru: {
    estimate: 'Оценка рынка',
    series: n => 'Серия · ' + n + ' ' + ruPlural(n, ['рынок', 'рынка', 'рынков']),
    original: 'Название рынка (оригинал)',
    market: 'Рынок прогнозов',
    closes: 'Закрытие: ',
    volume: 'Объём торгов: ',
    link: 'Рынок и условия ↗',
    more: n => 'Ещё ' + n,
  },
  he: {
    estimate: 'הערכת השוק',
    series: n => 'סדרה · ' + n + ' שווקים',
    original: 'כותרת המקור (אנגלית)',
    market: 'שוק תחזיות',
    closes: 'סגירה: ',
    volume: 'נפח מסחר: ',
    link: 'שוק ומידע נוסף ↗',
    more: n => 'עוד ' + n,
  },
};

function rwMarketBar(yes, label) {
  const v = Number(yes);
  const pct = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v * 1000) / 10)) : undefined;
  return h(
    'div',
    {
      className: 'bar rw-market-yes-bar',
      role: 'progressbar',
      'aria-label': label,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': pct,
    },
    h('i', { style: { width: (pct || 0) + '%' } }),
  );
}

function rwMarketDelta(m, he, movedOnly = false) {
  const c = rwMarketChange(m, he);
  return c && !(movedOnly && c.dir === 0)
    ? t(
        'small',
        'rw-market-delta rw-market-delta--' + (c.dir > 0 ? 'up' : c.dir < 0 ? 'down' : 'flat'),
        c.text,
      )
    : null;
}

export function MarketSeriesCard({ series, he }) {
  const L = RW_MARKET_TEXT[he ? 'he' : 'ru'];
  const [title, original] = rwMarketTitle(series, he);
  const items = series.items;
  const isSeries = items.length > 1;
  const volume = items.reduce((n, it) => n + (Number(it.m.volume) || 0), 0);
  const head = h(
    'header',
    { className: 'rw-market-head' },
    t('span', 'kicker', isSeries ? L.series(items.length) : original ? L.original : L.market),
    h('h3', original ? { lang: 'en', dir: 'auto' } : null, title),
  );
  if (!isSeries) {
    const m = items[0].m;
    return h(
      'article',
      { className: 'market rw-market-card' },
      head,
      h(
        'div',
        { className: 'rw-market-metrics' },
        h(
          'div',
          { className: 'rw-market-figure' },
          t('strong', null, rwMarketPct(m.yes, he)),
          t('span', null, L.estimate),
        ),
        rwMarketDelta(m, he),
      ),
      rwMarketBar(m.yes, L.estimate),
      h(
        'p',
        { className: 'market-meta' },
        m.end ? t('span', null, L.closes + rwMarketDate(m.end, he)) : null,
        t('span', null, L.volume + rwMarketMoney(volume, he)),
      ),
      h(External, { url: m.url }, L.link),
    );
  }
  const RW_MARKET_VISIBLE = 5;
  const row = ({ m, label }) =>
    h(
      'li',
      { key: m.id, className: 'rw-market-row' },
      h(
        'div',
        { className: 'rw-market-row-head' },
        h(
          External,
          { url: m.url, className: 'rw-market-row-label' },
          label ? h('bdi', { lang: 'en', dir: 'ltr' }, label) : rwMarketDeadline(m.question, m.end, he),
        ),
        t('strong', null, rwMarketPct(m.yes, he)),
      ),
      rwMarketBar(m.yes, (label || rwMarketDeadline(m.question, m.end, he)) + ' — ' + L.estimate),
      rwMarketDelta(m, he, true),
    );
  const rest = items.slice(RW_MARKET_VISIBLE);
  return h(
    'article',
    { className: 'market rw-market-card rw-market-series' },
    head,
    h('ol', { className: 'rw-market-rows' }, ...items.slice(0, RW_MARKET_VISIBLE).map(row)),
    rest.length
      ? h(
          'details',
          { className: 'rw-market-more' },
          t('summary', null, L.more(rest.length)),
          h('ol', { className: 'rw-market-rows' }, ...rest.map(row)),
        )
      : null,
    h('p', { className: 'market-meta' }, t('span', null, L.volume + rwMarketMoney(volume, he))),
  );
}
