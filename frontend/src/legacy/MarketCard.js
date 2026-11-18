import { fmtTime, h, ruMoney, ruPct, t } from '../app/runtime.js';
import { External } from '../components/External/External.js';
import { classifyMarket } from '../utils/classifyMarket.js';
import { marketTitle } from '../utils/marketTitle.js';
export function MarketCard({ m }) {
  return h(
    'article',
    { className: 'market' },
    t(
      'span',
      'kicker',
      classifyMarket(m.question) === 'peace'
        ? 'ПЕРЕМИРИЕ'
        : classifyMarket(m.question) === 'talks'
          ? 'ДИПЛОМАТИЯ'
          : 'ИРАН',
    ),
    t('h3', null, marketTitle(m.question)),
    t('b', null, ruPct(m.yes)),
    h(
      'div',
      { className: 'bar' },
      h('i', { style: { width: Math.max(0, Math.min(100, Number(m.yes || 0) * 100)) + '%' } }),
    ),
    h(
      'div',
      { className: 'market-meta' },
      t('span', null, '24 ч: ' + ruMoney(m.volume)),
      t('span', null, 'Ликвидность: ' + ruMoney(m.liquidity)),
    ),
    t('span', 'hint', 'Снимок: ' + fmtTime(m.asOf)),
    h(External, { url: m.url }, 'Открыть рынок ↗'),
  );
}
