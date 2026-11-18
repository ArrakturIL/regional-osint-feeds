// A conservative RSS guard: do not publish an excerpt about a different
// specifically named place as the factual lead of the headline.
// It does not claim to verify an event: uncertain summaries are held.
const PLACE_TYPE =
  '(?:province|region|district|city|town|village|island|airport|air\\s+base|naval\\s+base|military\\s+base|port|hospital|strait)';
const PROPER = "[A-Z][\\p{L}\\p{M}\\p{N}’'-]{2,}";
const AFTER = new RegExp(
  '\\b' + PLACE_TYPE + '\\s+(?:of\\s+|near\\s+|in\\s+)?(' + PROPER + '(?:\\s+' + PROPER + ')?)',
  'gu',
);
const BEFORE = new RegExp('\\b(' + PROPER + '(?:\\s+' + PROPER + ')?)\\s+' + PLACE_TYPE + '\\b', 'gu');
const STOP = new Set([
  'the',
  'this',
  'southern',
  'northern',
  'western',
  'eastern',
  'islamic',
  'republic',
  'state',
  'military',
  'iranian',
  'israeli',
]);
function locationNames(value) {
  const output = new Set(),
    text = String(value || '');
  for (const expression of [AFTER, BEFORE]) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      const candidate = match[1].normalize('NFKC').toLowerCase().trim();
      if (candidate.split(/\s+/).some(x => !STOP.has(x))) output.add(candidate);
    }
  }
  return [...output];
}
const commonLocation = (a, b) => {
  const parts = s => s.split(/\s+/).filter(p => p.length >= 4 && !STOP.has(p));
  for (const x of a)
    for (const y of b) {
      const xs = parts(x),
        ys = parts(y);
      if (xs.some(p => ys.includes(p))) return true;
    }
  return false;
};
export function checkFeedSummary(headline, summary) {
  const text = String(summary || '').trim();
  const candidate = String(headline || '').trim();
  const locationsTitle = locationNames(candidate),
    locationsBody = locationNames(text);
  if (locationsTitle.length && locationsBody.length && !commonLocation(locationsTitle, locationsBody)) {
    return { safeSummary: '', status: 'needs_review', reason: 'conflicting_named_place' };
  }
  return { safeSummary: text, status: 'ok', reason: null };
}
