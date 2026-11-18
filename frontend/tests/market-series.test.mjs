// STATUS #10: Polymarket series, localized titles and readable numbers (RU/HE).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rwMarketSeries,
  rwMarketTitle,
  rwMarketPct,
  rwMarketChange,
  rwMarketMoney,
} from '../src/utils/marketSeries.js';

const mk = (id, question, yes, volume, end, extra = {}) => ({ id, question, yes, volume, end, ...extra });
const live = [
  mk('1', 'US x Iran Effective Ceasefire by November 30?', 0.455, 43855, '2026-11-30T20:00:00Z'),
  mk('2', 'US x Iran Effective Ceasefire by November 22?', 0.33, 110793, '2026-11-22T20:29:00Z'),
  mk('3', 'US x Iran Effective Ceasefire by December 31?', 0.715, 35067, '2026-12-31T20:00:00Z'),
  mk('4', 'Will Mojtaba Khamenei be head of state in Iran end of 2026?', 0.4, 9000, '2026-12-31T00:00:00Z'),
  mk('5', 'Will Reza Pahlavi be head of state in Iran end of 2026?', 0.1, 8000, '2026-12-31T00:00:00Z'),
  mk('6', 'Will Marco Rubio attend a US x Iran diplomatic meeting by November 30?', 0.2, 500, '2026-11-30T00:00:00Z'),
  mk('7', 'Will J.D. Vance attend a US x Iran diplomatic meeting by November 30?', 0.3, 400, '2026-11-30T00:00:00Z'),
  mk('8', 'Will the U.S. invade Iran before 2027?', 0.075, 45873, '2026-12-31T00:00:00Z'),
  mk('9', 'Will Kuwait recognize Israel by December 31?', 0.05, 100, '2026-12-31T00:00:00Z'),
  mk('10', 'Will Kuwait recognize Israel by March 31?', 0.08, 50, '2027-03-31T00:00:00Z'),
];

test('deadline variants become one series ordered by deadline, with a localized title', () => {
  const s = rwMarketSeries(live).find(x => x.key.includes('ceasefire'));
  assert.equal(s.kind, 'deadline');
  assert.deepEqual(s.items.map(x => x.m.id), ['2', '1', '3']);
  assert.deepEqual(rwMarketTitle(s, false), ['Прекращение огня США–Иран', false]);
  assert.deepEqual(rwMarketTitle(s, true), ['הפסקת אש בין ארה״ב לאיראן', false]);
});

test('person variants become one series ordered by estimate; names are row labels', () => {
  const series = rwMarketSeries(live);
  const head = series.find(x => x.kind === 'head');
  assert.deepEqual(head.items.map(x => x.label), ['Mojtaba Khamenei', 'Reza Pahlavi']);
  assert.equal(rwMarketTitle(head, false)[0], 'Кто возглавит Иран к концу 2026');
  const attend = series.find(x => x.kind === 'attend');
  assert.deepEqual(attend.items.map(x => x.label), ['J.D. Vance', 'Marco Rubio']);
  assert.match(rwMarketTitle(attend, false)[0], /^Кто придёт на встречу США–Иран до 30 нояб/);
});

test('unknown questions keep the original text and are marked as original', () => {
  const series = rwMarketSeries(live);
  const single = series.find(x => x.kind === 'single');
  assert.deepEqual(rwMarketTitle(single, false), ['Will the U.S. invade Iran before 2027?', true]);
  const kuwait = series.find(x => x.key.includes('kuwait'));
  assert.equal(kuwait.items.length, 2);
  assert.deepEqual(rwMarketTitle(kuwait, true), ['Will Kuwait recognize Israel …?', true]);
});

test('series are ordered by total trading volume; every market appears exactly once', () => {
  const series = rwMarketSeries(live);
  assert.equal(series[0].key.includes('ceasefire'), true);
  assert.equal(series.flatMap(s => s.items).length, live.length);
});

test('numbers: locale percent, compact money, change with direction and window; HE has no Cyrillic', () => {
  assert.equal(rwMarketPct(0.455, false), '45,5%');
  assert.equal(rwMarketPct(0.455, true), '45.5%');
  assert.equal(rwMarketPct(undefined, false), '—');
  assert.match(rwMarketMoney(110793, false), /^110,8\s?тыс\.\s?\$$/);
  const m = { changePoints: -3.5, asOf: '2026-11-18T18:13:00Z', comparisonFrom: '2026-11-18T12:13:00Z' };
  assert.deepEqual(rwMarketChange(m, false), { dir: -1, text: '▼ 3,5 п.п. за 6 ч' });
  assert.equal(rwMarketChange({ ...m, changePoints: 0.01 }, false).dir, 0);
  assert.equal(rwMarketChange({}, false), null);
  for (const text of [
    rwMarketChange(m, true).text,
    rwMarketMoney(110793, true),
    ...rwMarketSeries(live).map(s => rwMarketTitle(s, true)[0]),
  ])
    assert.doesNotMatch(text, /[Ѐ-ӿ]/, text);
});

test('deadline row label comes from the question, not from the close timestamp (Nov 30 ≠ Dec 1)', async () => {
  const { rwMarketDeadline } = await import('../src/utils/marketSeries.js');
  assert.equal(rwMarketDeadline('Iran full airspace closure by November 30?', '2026-11-30T23:59:00Z', false), 'до 30 нояб.');
  assert.equal(rwMarketDeadline('Iran leadership change by June 30, 2027?', '2027-06-30T23:00:00Z', false), 'до 30 июн. 2027 г.');
  assert.equal(rwMarketDeadline('Will the U.S. invade Iran before 2027?', '2026-12-31T00:00:00Z', false), 'до 2027 г.');
  assert.equal(rwMarketDeadline('Will the U.S. invade Iran before 2027?', '2026-12-31T00:00:00Z', true), 'עד 2027');
  assert.match(rwMarketDeadline('Odd wording?', '2026-11-22T20:29:00Z', false), /^до 22 нояб/);
});
