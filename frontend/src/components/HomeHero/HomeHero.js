import { UI_HE, h, t } from '../../app/runtime.js';
// Concept E hero (owner 21.11): headline over an abstract radar. The SIG marks
// are the freshest urgent/important items of the home feed, not map positions:
// the note under the lead says so in words.
// Module-level names are prefixed: the compatibility build concatenates modules.
// The radar occupies the right part of the hero (left in Hebrew), so the
// marks never sit under the headline. Slot: dot x, y, label x, y, anchor (LTR).
const HERO_W = 800,
  HERO_H = 520,
  HERO_CX = 430,
  HERO_CY = 250;
const HERO_SLOTS = [
  [560, 150, 500, 95, 'end'],
  [400, 380, 460, 450, 'start'],
  [690, 300, 640, 405, 'end'],
];
export function heroSignals(stories, now = Date.now()) {
  const rank = { urgent: 0, important: 1 };
  return (Array.isArray(stories) ? stories : [])
    .filter(s => s && (s.tier === 'urgent' || s.tier === 'important'))
    .filter(s => !s.time || now - Date.parse(s.time) < 12 * 3600e3)
    .sort((a, b) => rank[a.tier] - rank[b.tier] || Date.parse(b.time || 0) - Date.parse(a.time || 0))
    .slice(0, HERO_SLOTS.length);
}
export function HomeHero({ stories }) {
  const he = UI_HE;
  const x = v => (he ? HERO_W - v : v);
  const signals = heroSignals(stories);
  const label = (i, tier) =>
    'SIG-0' + (i + 1) + ' · ' + (tier === 'urgent' ? (he ? 'דחוף' : 'СРОЧНО') : he ? 'חשוב' : 'ВАЖНО');
  const ring = (rx, ry, o, cls) =>
    h('ellipse', { cx: x(HERO_CX), cy: HERO_CY, rx, ry, stroke: 'currentColor', strokeOpacity: o, fill: 'none', className: cls });
  return h(
    'section',
    { className: 'rw-hero', 'aria-labelledby': 'rw-hero-title' },
    h(
      'svg',
      {
        className: 'rw-hero-radar',
        viewBox: '0 0 ' + HERO_W + ' ' + HERO_H,
        preserveAspectRatio: he ? 'xMinYMid slice' : 'xMaxYMid slice',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h(
        'defs',
        null,
        h(
          'pattern',
          { id: 'rw-hero-dots', width: 24, height: 24, patternUnits: 'userSpaceOnUse' },
          h('circle', { cx: 1, cy: 1, r: 1, fill: 'currentColor', fillOpacity: 0.12 }),
        ),
      ),
      h('rect', { width: HERO_W, height: HERO_H, fill: 'url(#rw-hero-dots)' }),
      h(
        'g',
        { className: 'rw-hero-field' },
        ring(380, 220, 0.1),
        ring(280, 160, 0.14),
        ring(180, 104, 0.18),
        ring(470, 300, 0.12, 'rw-hero-flow'),
        ring(560, 360, 0.08, 'rw-hero-flow rw-hero-flow-slow'),
      ),
      signals.length
        ? signals.map((s, i) => {
            const [px, py, lx, ly, anchor] = HERO_SLOTS[i],
              tone = s.tier === 'urgent' ? 'urgent' : 'important',
              start = (anchor === 'start') !== he;
            return h(
              'g',
              { key: s.id || i, className: 'rw-hero-sig rw-hero-sig-' + tone },
              h('line', { x1: x(px), y1: py, x2: x(lx), y2: ly, stroke: 'currentColor', strokeOpacity: 0.6 }),
              h('circle', { className: 'rw-hero-dot', cx: x(px), cy: py, r: 5, fill: 'currentColor' }),
              h('circle', { className: 'rw-hero-pulse', cx: x(px), cy: py, r: 5, fill: 'none', stroke: 'currentColor' }),
              h(
                'text',
                { x: x(lx) + (start ? 6 : -6), y: ly + (ly < py ? -8 : 18), textAnchor: start ? 'start' : 'end' },
                label(i, s.tier),
              ),
            );
          })
        : h('circle', { className: 'rw-hero-calm', cx: x(HERO_CX + 120), cy: HERO_CY - 60, r: 5, fill: 'currentColor' }),
    ),
    h(
      'div',
      { className: 'rw-hero-copy' },
      t('p', 'rw-hero-kicker', he ? '// סקירה אזורית · OSINT · מקורות גלויים' : '// Обзор региона · OSINT · открытые источники'),
      h(
        'h1',
        { className: 'rw-hero-title', id: 'rw-hero-title' },
        t('span', null, he ? 'מה קורה באזור' : 'Что происходит'),
        t('em', null, he ? 'היום' : 'в регионе сегодня'),
      ),
      t(
        'p',
        'rw-hero-lead',
        he
          ? 'חדשות, אימות ופרשנות — בנפרד. רואים מי דיווח, ודיווח אינו מוצג כעובדה מאומתת.'
          : 'Новости, проверка и комментарий — раздельно. Видно, кто сообщил, и сообщение не выдаётся за подтверждённый факт.',
      ),
      t(
        'p',
        'rw-hero-note',
        he
          ? 'הרקע — תרשים מופשט, לא מפה. סימוני SIG — אותות טריים לפי דחיפות.'
          : 'Фон — абстрактная схема, не карта. Метки SIG — свежие сигналы по срочности.',
      ),
    ),
  );
}
