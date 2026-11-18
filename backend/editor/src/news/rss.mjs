import { analyze } from './events.mjs';
import { checkFeedSummary } from './integrity.mjs';

function decode(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#(\d+)|#x([0-9a-f]+));/gi, (m, d, h) => {
      if (d || h) {
        const n = d ? Number(d) : parseInt(h, 16);
        return n > 0 && n < 1114112 ? String.fromCodePoint(n) : '';
      }
      return (
        { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[m.slice(1, -1).toLowerCase()] || m
      );
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tag(s, key) {
  const m = s.match(
    new RegExp('<(?:[\\w.-]+:)?' + key + '\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?' + key + '>', 'i'),
  );
  return m ? decode(m[1]) : '';
}
function safeLink(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' ? x.href.slice(0, 1000) : null;
  } catch {
    return null;
  }
}
export function entries(xml, feed, now) {
  const nodes = xml.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) || [],
    out = [];
  for (const item of nodes.slice(0, 75)) {
    const title = tag(item, 'title').slice(0, 260);
    const sourceSummary = (tag(item, 'description') || tag(item, 'summary') || tag(item, 'content')).slice(
      0,
      340,
    );
    const summary = checkFeedSummary(title, sourceSummary).safeSummary;
    const atom = item.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?>/i);
    const link = safeLink(tag(item, 'link') || decode(atom?.[1] || ''));
    const pub = Date.parse(
      tag(item, 'pubDate') || tag(item, 'published') || tag(item, 'updated') || tag(item, 'date'),
    );
    if (!title || !link || !Number.isFinite(pub) || pub > now + 600000 || pub < now - 72 * 3600000) continue;
    const a = analyze({ id: link, source: feed[0], headline: title, summary, published_ms: pub });
    if (a.policy !== 'candidate') continue;
    out.push({ source: feed[0], title, summary, link, pub, score: a.score });
  }
  return out;
}
export async function load(feed, now) {
  const c = new AbortController(),
    timer = setTimeout(() => c.abort(), 8000);
  try {
    const r = await fetch(feed[1], {
      redirect: 'follow',
      headers: {
        Accept: 'application/rss+xml,application/xml,text/xml,*/*',
        'User-Agent': 'RegionalWatch/1.0 RSS',
      },
      signal: c.signal,
    });
    if (!r.ok) return { name: feed[0], state: 'error', http: r.status, error: 'HTTP ' + r.status, items: [] };
    const xml = (await r.text()).slice(0, 400000);
    if (!/<rss\b|<rdf:RDF\b|<feed(?:\s|>)/i.test(xml))
      return { name: feed[0], state: 'error', http: r.status, error: 'Not RSS/Atom', items: [] };
    const items = entries(xml, feed, now);
    return { name: feed[0], state: items.length ? 'ok' : 'empty', http: r.status, error: null, items };
  } catch (e) {
    return { name: feed[0], state: 'error', http: null, error: String(e).slice(0, 100), items: [] };
  } finally {
    clearTimeout(timer);
  }
}
