import { HOUR, MINUTE } from '../../config/constants.js';
import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
import { href, textOnly } from '../../utils/text.js';
export const CENTCOM_RSS = "https://www.centcom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=808&max=20";
export async function centcomRss(env, slot) {
  const xml = await get(CENTCOM_RSS, "text");
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) throw new Error("unexpected CENTCOM RSS response");
  const parsed = [];
  for (const [, body] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const field = tag => textOnly(body.match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i"))?.[1]);
    const title = field("title"), url = href(field("link"), CENTCOM_RSS);
    const published = Date.parse(field("pubDate"));
    if (!title || !url || !Number.isFinite(published) || published > slot + 5 * MINUTE) continue;
    parsed.push(item(url, {url, title, published_at:new Date(published).toISOString(),
      source_feed:CENTCOM_RSS, source_type:"official_centcom_news_rss",
      caveat:"Official news RSS only; may be archival. Poll time is not publication time; not a complete operations or press-release feed."}));
  }
  if (!parsed.length) throw new Error("unexpected CENTCOM RSS: no valid official dated items");
  const latest = Math.max(...parsed.map(x => Date.parse(x.payload.published_at)));
  const entries = parsed.filter(x => Date.parse(x.payload.published_at) >= slot - 30 * 24 * HOUR);
  return {entries, missing:entries.length ? [] : ["recent_publications"],
    detail:entries.length ? null : "RSS reachable but archival; latest publication " + new Date(latest).toISOString() + "; no items within 30 days. Not current coverage."};
}

// Public GitHub mirror of the official DVIDS Central Command Public Affairs unit feed.
// The GitHub Action fetches DVIDS directly; this Worker never requests blocked DVIDS URLs.
