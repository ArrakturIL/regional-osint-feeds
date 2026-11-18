import { FEEDS as EVENT_FEEDS } from './events.mjs';
import { canonicalNewsUrl, normalizedHeadline } from './normalization.mjs';
import { load } from './rss.mjs';
import { disabledPublishers } from './source-controls.mjs';

const FEEDS = EVENT_FEEDS.map(x => [x[0], x[1], x[4], x[3], x[2]]);
async function digest(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)]
    .slice(0, 12)
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function ingestNewsFeeds(env, now) {
  const off = await disabledPublishers(env.NEWS_DB, now);
  const runs = await Promise.all(FEEDS.filter(x => !off.has(x[4])).map(x => load(x.slice(0, 4), now))),
    all = runs.flatMap(x => x.items);
  for (const r of runs)
    await env.NEWS_DB.prepare(
      'INSERT INTO feed_status(name,checked_ms,status,http_status,items_count,error) VALUES(?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET checked_ms=excluded.checked_ms,status=excluded.status,http_status=excluded.http_status,items_count=excluded.items_count,error=excluded.error',
    )
      .bind(r.name, now, r.state, r.http, r.items.length, r.error)
      .run();
  for (const x of FEEDS.filter(f => off.has(f[4])))
    await env.NEWS_DB.prepare(
      'INSERT INTO feed_status(name,checked_ms,status,http_status,items_count,error) VALUES(?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET checked_ms=excluded.checked_ms,status=excluded.status,http_status=excluded.http_status,items_count=excluded.items_count,error=excluded.error',
    )
      .bind(x[0], now, 'disabled', null, 0, 'disabled by operator')
      .run();
  all.sort((a, b) => b.score - a.score || b.pub - a.pub);
  // A canonical URL is one technical article identity, regardless of UTM order.
  // Query existing IDs once to avoid introducing new duplicates during migration.
  const known =
    (
      await env.NEWS_DB.prepare('SELECT url FROM news_items WHERE published_ms>=?')
        .bind(now - 8 * 86400000)
        .all()
    ).results || [];
  const existingUrls = new Set(known.map(row => canonicalNewsUrl(row.url)).filter(Boolean));
  const seenUrls = new Set(),
    samePublisherTitles = new Set();
  let inserted = 0;
  for (const item of all.slice(0, 240)) {
    const canonical = canonicalNewsUrl(item.link);
    if (!canonical || seenUrls.has(canonical) || existingUrls.has(canonical)) continue;
    const titleKey =
      item.source +
      '\u0000' +
      normalizedHeadline(item.title) +
      '\u0000' +
      Math.floor(item.pub / (6 * 3600000));
    // Avoid an identical same-publisher headline repeated in the same time window,
    // without suppressing independent publishers or unrelated events.
    if (samePublisherTitles.has(titleKey)) continue;
    seenUrls.add(canonical);
    samePublisherTitles.add(titleKey);
    const id = await digest(canonical);
    const r = await env.NEWS_DB.prepare(
      'INSERT OR IGNORE INTO news_items (id,source,headline,summary,url,published_ms,discovered_ms,priority) VALUES(?,?,?,?,?,?,?,?)',
    )
      .bind(id, item.source, item.title, item.summary, item.link, item.pub, now, item.score)
      .run();
    existingUrls.add(canonical);
    if (r.meta?.changes) inserted++;
  }
  await env.NEWS_DB.prepare('DELETE FROM news_items WHERE published_ms < ?')
    .bind(now - 8 * 86400000)
    .run();
  return { runs, all, inserted };
}
