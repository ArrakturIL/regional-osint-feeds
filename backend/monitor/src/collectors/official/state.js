import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
import { href, textOnly } from '../../utils/text.js';
export const STATE_FEED = "https://travel.state.gov/_res/rss/TAsTWs.xml";
export const STATE_REGION = /\b(israel|gaza|west bank|iran|iraq|jordan|lebanon|syria|saudi arabia|bahrain|kuwait|qatar|oman|united arab emirates|yemen|egypt|turkey|cyprus)\b/i;

// Country Travel Advisories; not a complete feed of embassy security alerts or evacuations.
export async function stateTravelAdvisories() {
  const xml = await get(STATE_FEED, "text");
  if (!/<rss\b/i.test(xml) || !/<item\b/i.test(xml))
    throw new Error("unexpected State Department RSS response");
  const entries = [];
  let relevant = 0;
  for (const [, body] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const field = tag => textOnly(body.match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i"))?.[1]);
    const title = field("title");
    if (!title || !STATE_REGION.test(title)) continue;
    relevant++;
    const linkText = field("link");
    const url = href(linkText?.replace(/^http:\/\//i, "https://"), STATE_FEED);
    if (!url) continue;
    entries.push(item(url, {
      url, title, published: field("pubDate") || null,
      description: field("description") || null,
      source_feed: STATE_FEED,
      coverage: "US State Department travel advisories, not an exhaustive embassy alert feed"
    }));
    if (entries.length >= 40) break;
  }
  if (relevant > 0 && !entries.length)
    throw new Error("unexpected State Department RSS links");
  return entries;
}


// FCDO regional guidance (GOV.UK Content API).
