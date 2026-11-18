/** Russian numeric inflection: 1 публикация, 2 публикации, 5/11/17 публикаций. */
export function ruPlural(value, forms) {
  const n = Math.abs(Math.trunc(Number(value) || 0));
  const teen = n % 100;
  if (teen >= 11 && teen <= 14) return forms[2];
  const last = n % 10;
  return last === 1 ? forms[0] : last >= 2 && last <= 4 ? forms[1] : forms[2];
}
