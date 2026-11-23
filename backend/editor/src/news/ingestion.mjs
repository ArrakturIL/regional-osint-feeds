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
// Sources (Maariv, Ynet and others) rewrite a headline after publication: we
// translated the first version (22.11: clickbait → «Israel on the way to a deal
// with Greece»). A changed headline on a known URL replaces the stored one and
// clears the RU text, so the item is translated again (HE jobs follow the new
// source hash). Guards: only items under 24 h, a real wording change (not case
// or punctuation), at most RETITLE_MAX_PER_RUN per run and ONE rewrite per item
// — A/B-tested headlines must not loop the translator.
export const RETITLE_WINDOW_MS = 24 * 3600000;
export const RETITLE_MAX_PER_RUN = 10;
const RETITLE_TABLE =
  'CREATE TABLE IF NOT EXISTS news_retitles(id TEXT PRIMARY KEY,old_headline TEXT NOT NULL,new_headline TEXT NOT NULL,updated_ms INTEGER NOT NULL)';

function isRetitle(row, item, now) {
  const pub = Number(row.published_ms);
  if (!item.title || !row.headline || !Number.isFinite(pub) || now - pub > RETITLE_WINDOW_MS) return false;
  return normalizedHeadline(item.title) !== normalizedHeadline(row.headline);
}

async function applyRetitles(env, retitled, now) {
  if (!retitled.length) return 0;
  await env.NEWS_DB.prepare(RETITLE_TABLE).run();
  await env.NEWS_DB.prepare('DELETE FROM news_retitles WHERE updated_ms < ?')
    .bind(now - 8 * 86400000)
    .run();
  let updated = 0;
  for (const { row, item } of retitled) {
    if (updated >= RETITLE_MAX_PER_RUN) break;
    // One rewrite per item: the INSERT is the lock.
    const lock = await env.NEWS_DB.prepare(
      'INSERT OR IGNORE INTO news_retitles(id,old_headline,new_headline,updated_ms) VALUES(?,?,?,?)',
    )
      .bind(row.id, row.headline, item.title, now)
      .run();
    if (!lock.meta?.changes) continue;
    await env.NEWS_DB.prepare(
      // An empty RSS summary keeps the stored one.
      "UPDATE news_items SET headline=?,summary=COALESCE(NULLIF(?,''),summary),headline_ru=NULL,summary_ru=NULL WHERE id=?",
    )
      .bind(item.title, item.summary || '', row.id)
      .run();
    updated++;
  }
  return updated;
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
      await env.NEWS_DB.prepare('SELECT id,url,headline,published_ms FROM news_items WHERE published_ms>=?')
        .bind(now - 8 * 86400000)
        .all()
    ).results || [];
  const existingUrls = new Set(known.map(row => canonicalNewsUrl(row.url)).filter(Boolean));
  const knownByUrl = new Map(known.map(row => [canonicalNewsUrl(row.url), row]));
  const retitled = [];
  const seenUrls = new Set(),
    samePublisherTitles = new Set();
  let inserted = 0;
  for (const item of all.slice(0, 240)) {
    const canonical = canonicalNewsUrl(item.link);
    if (canonical && existingUrls.has(canonical) && !seenUrls.has(canonical)) {
      const row = knownByUrl.get(canonical);
      if (row && isRetitle(row, item, now)) retitled.push({ row, item });
    }
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
      // 21.11: a publication time after we saw the item is the source's clock
      // (Jerusalem Post stamps 5–9 min ahead); the moment of discovery is the honest bound.
      .bind(id, item.source, item.title, item.summary, item.link, Math.min(item.pub, now), now, item.score)
      .run();
    existingUrls.add(canonical);
    if (r.meta?.changes) inserted++;
  }
  const updated = await applyRetitles(env, retitled, now);
  await env.NEWS_DB.prepare('DELETE FROM news_items WHERE published_ms < ?')
    .bind(now - 8 * 86400000)
    .run();
  return { runs, all, inserted, retitled: updated };
}
