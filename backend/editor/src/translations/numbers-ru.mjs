// Small numbers that a correct Russian translation may spell out: cardinals
// («3 лидера» → «трёх лидеров») and collectives («top 3» → «тройка»). Only the
// same value's word is accepted, so a changed number still fails. Shared by the
// news gate (news-mirror.mjs) and the analyst gate (analysts/translation.mjs).
const RU_NUMBER_WORDS = {
  1: 'одн|один',
  2: 'два|две|двух|двум|двойк',
  3: 'три|тр[её]х|тр[её]м|тройк',
  4: 'четыр|четв[её]рк',
  5: 'пят[ьиюе]|пят[её]рк',
  6: 'шест[ьиюе]|шест[её]рк',
  7: 'сем[ьиюе]|сем[её]рк',
  8: 'восем|восьм|восьм[её]рк',
  9: 'девят[ьиюек]',
  10: 'десят[ьиюек]',
};
const cache = new Map();
// → a RegExp for the Russian word forms of n (1–10), or null.
export function ruNumberWord(n) {
  if (!RU_NUMBER_WORDS[n]) return null;
  if (!cache.has(n)) cache.set(n, new RegExp('(?<![а-яё])(?:' + RU_NUMBER_WORDS[n] + ')', 'iu'));
  return cache.get(n);
}
