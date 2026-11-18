// STATUS #10: Polymarket on /data. Markets that differ only by deadline or by person
// are one question; they are shown as one card with a row per deadline/person.

const RW_MARKET_MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December';
const RW_MARKET_DEADLINE = new RegExp(
  '^(.*?)\\s+(?:by|before)\\s+(?:(?:' + RW_MARKET_MONTHS + ')[^?]*|\\d{4})\\?$',
  'i',
);
const RW_MARKET_FIELDS = [
  { kind: 'head', re: /^Will (.+) be head of state in Iran end of (\d{4})\?$/i },
  { kind: 'attend', re: /^Will (.+) attend a US x Iran diplomatic meeting by (.+)\?$/i },
];

// Titles of recurring questions; anything else is shown as the original (English) text.
const RW_MARKET_TITLES = {
  'us x iran effective ceasefire': ['Прекращение огня США–Иран', 'הפסקת אש בין ארה״ב לאיראן'],
  'iran leadership change': ['Смена руководства Ирана', 'חילופי הנהגה באיראן'],
  'israel military action against lebanon': [
    'Военная операция Израиля против Ливана',
    'פעולה צבאית של ישראל נגד לבנון',
  ],
  'iran full airspace closure': [
    'Полное закрытие воздушного пространства Ирана',
    'סגירה מלאה של המרחב האווירי של איראן',
  ],
  'us-iran final nuclear deal': ['Окончательная ядерная сделка США–Иран', 'הסכם גרעין סופי בין ארה״ב לאיראן'],
  'will iran target oman': ['Удар Ирана по Оману', 'תקיפה איראנית נגד עומאן'],
  'will iran target bahrain': ['Удар Ирана по Бахрейну', 'תקיפה איראנית נגד בחריין'],
  'us-iran hormuz agreement': ['Соглашение США–Иран по Ормузскому проливу', 'הסכם ארה״ב–איראן על מצר הורמוז'],
  'iran-oman hormuz agreement': [
    'Соглашение Иран–Оман по Ормузскому проливу',
    'הסכם איראן–עומאן על מצר הורמוז',
  ],
  'next us-iran senior diplomatic meeting': [
    'Следующая встреча США–Иран на высоком уровне',
    'הפגישה הדיפלומטית הבכירה הבאה בין ארה״ב לאיראן',
  ],
};

export function rwMarketSeries(markets) {
  const buckets = new Map();
  for (const m of Array.isArray(markets) ? markets : []) {
    const q = String(m?.question || '').trim();
    let key = 'single:' + (m?.id ?? q),
      kind = 'single',
      label = null,
      base = q,
      field = null;
    for (const f of RW_MARKET_FIELDS) {
      const x = q.match(f.re);
      if (x) {
        kind = f.kind;
        label = x[1];
        field = x[2];
        key = f.kind + ':' + x[2].toLowerCase();
        break;
      }
    }
    if (kind === 'single') {
      const d = q.match(RW_MARKET_DEADLINE);
      if (d) {
        kind = 'deadline';
        base = d[1];
        key = 'deadline:' + d[1].toLowerCase();
      }
    }
    if (!buckets.has(key)) buckets.set(key, { key, kind, base, field, items: [] });
    buckets.get(key).items.push({ m, label });
  }
  const out = [];
  for (const b of buckets.values()) {
    if (b.items.length < 2) {
      for (const it of b.items) out.push({ key: 'single:' + it.m.id, kind: 'single', items: [it] });
      continue;
    }
    if (b.kind === 'deadline')
      b.items.sort((a, c) => Date.parse(a.m.end || '') - Date.parse(c.m.end || '') || 0);
    else b.items.sort((a, c) => (Number(c.m.yes) || 0) - (Number(a.m.yes) || 0));
    out.push(b);
  }
  const volume = s => s.items.reduce((n, it) => n + (Number(it.m.volume) || 0), 0);
  return out.sort((a, c) => volume(c) - volume(a));
}

// [title, isOriginal]: a localized title when the question is known, else the original.
export function rwMarketTitle(series, he) {
  const i = he ? 1 : 0;
  if (series.kind === 'head')
    return [(he ? 'מי יעמוד בראש איראן בסוף ' : 'Кто возглавит Иран к концу ') + series.field, false];
  if (series.kind === 'attend') {
    const end = series.items[0]?.m?.end;
    return [
      (he ? 'מי ישתתף בפגישה דיפלומטית בין ארה״ב לאיראן' : 'Кто придёт на встречу США–Иран') +
        (end ? (he ? ' עד ' : ' до ') + rwMarketDate(end, he) : ''),
      false,
    ];
  }
  const base = series.kind === 'deadline' ? series.base : series.items[0]?.m?.question;
  const known = RW_MARKET_TITLES[String(base || '').toLowerCase()];
  if (known) return [known[i], false];
  return [series.kind === 'deadline' ? base + ' …?' : String(base || ''), true];
}

export function rwMarketPct(yes, he) {
  const v = Number(yes);
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat(he ? 'he-IL' : 'ru-RU', { maximumFractionDigits: 1 }).format(v * 100) + '%';
}

export function rwMarketChange(m, he) {
  const p = Number(m?.changePoints);
  if (!Number.isFinite(p)) return null;
  const hours = Math.round((Date.parse(m.asOf || '') - Date.parse(m.comparisonFrom || '')) / 3600000);
  const span =
    Number.isFinite(hours) && hours > 0 ? (he ? ' ב־' + hours + ' שעות' : ' за ' + hours + ' ч') : '';
  if (Math.abs(p) < 0.05) return { dir: 0, text: (he ? 'ללא שינוי' : 'без изменений') + span };
  const n = new Intl.NumberFormat(he ? 'he-IL' : 'ru-RU', { maximumFractionDigits: 1 }).format(Math.abs(p));
  return { dir: p > 0 ? 1 : -1, text: (p > 0 ? '▲ ' : '▼ ') + n + (he ? ' נק׳ אחוז' : ' п.п.') + span };
}

export function rwMarketMoney(v, he) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(he ? 'he-IL' : 'ru-RU', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

export function rwMarketDate(iso, he) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return new Intl.DateTimeFormat(he ? 'he-IL' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'Asia/Jerusalem',
  }).format(d);
}

// "до 30 нояб." from "... by November 30?" — the question's own deadline. The close
// timestamp is often the next calendar day in Israel time, so it is only a fallback.
export function rwMarketDeadline(question, end, he) {
  const until = he ? 'עד ' : 'до ';
  const q = String(question || '');
  const md = q.match(
    new RegExp('(?:by|before)\\s+(' + RW_MARKET_MONTHS + ')\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?', 'i'),
  );
  if (md) {
    const month = RW_MARKET_MONTHS.split('|').findIndex(x => x.toLowerCase() === md[1].toLowerCase());
    const year = md[3] ? Number(md[3]) : new Date(end || Date.now()).getUTCFullYear();
    const d = new Date(Date.UTC(year, month, Number(md[2]), 12));
    const sameYear = year === new Date().getUTCFullYear();
    return (
      until +
      new Intl.DateTimeFormat(he ? 'he-IL' : 'ru-RU', {
        day: 'numeric',
        month: 'short',
        year: sameYear ? undefined : 'numeric',
        timeZone: 'UTC',
      }).format(d)
    );
  }
  const y = q.match(/before\s+(\d{4})\?/i);
  if (y) return until + y[1] + (he ? '' : ' г.');
  return until + rwMarketDate(end, he);
}
