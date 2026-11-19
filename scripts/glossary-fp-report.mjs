// B11 part 1: false-positive report for the Wikidata glossary. Read-only D1:
// runs the glossary over accepted RU and HE news translations of the last
// 7 days and lists what the Wikidata entities would newly reject.
// Usage (Actions): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_API_TOKEN set.
import { wikidataEntityIssue as entityIssue } from '../backend/editor/src/translations/glossary.mjs';
import { WIKIDATA_ENTITIES } from '../backend/editor/src/translations/glossary-wikidata.mjs';

const NEWS_DB = 'd9ba2c51-d551-4615-bbe2-37e76e2d668a';
const since = Date.now() - 7 * 86400000;
async function query(sql) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${NEWS_DB}/query`,
    {
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.CLOUDFLARE_D1_API_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ sql, params: [since] }),
    },
  );
  const j = await r.json();
  if (!j.success) throw Error('D1 query failed: ' + JSON.stringify(j.errors));
  return j.result[0].results;
}
const wd = new Set(WIKIDATA_ENTITIES.map(e => e.id + '_name_missing'));
const pairs = [];
for (const r of await query(
  'SELECT headline,headline_ru,summary,summary_ru FROM news_items WHERE headline_ru IS NOT NULL AND published_ms>? ORDER BY published_ms DESC LIMIT 1000',
)) {
  pairs.push(['ru.title', r.headline, r.headline_ru]);
  if (r.summary && r.summary_ru) pairs.push(['ru.summary', r.summary, r.summary_ru]);
}
for (const r of await query(
  "SELECT n.headline,n.summary,t.title,t.body FROM regional_i18n t JOIN news_items n ON n.id=t.item_id WHERE t.kind='news' AND t.language='he' AND t.created_at_ms>? ORDER BY t.created_at_ms DESC LIMIT 1000",
)) {
  pairs.push(['he.title', r.headline, r.title]);
  if (r.summary && r.body) pairs.push(['he.body', r.summary, r.body]);
}
const counts = {},
  hits = {};
for (const [field, source, target] of pairs) {
  counts[field] = (counts[field] || 0) + 1;
  const code = entityIssue(source, target, field.slice(0, 2));
  if (!code || !wd.has(code)) continue;
  const key = field + ' ' + code;
  (hits[key] ||= []).push(String(source).slice(0, 90) + ' => ' + String(target).slice(0, 90));
}
console.log('checked', JSON.stringify(counts));
const sorted = Object.entries(hits).sort((a, b) => b[1].length - a[1].length);
console.log('new rejections', sorted.reduce((n, [, v]) => n + v.length, 0));
for (const [key, list] of sorted) {
  console.log(`${list.length}\t${key}`);
  for (const ex of list.slice(0, 2)) console.log('\t- ' + ex.replace(/\s+/g, ' '));
}
