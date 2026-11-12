/**
 * Strict technical article identity and English headline scoring for current RSS.
 *
 * This does not replace the future event-level multilingual classifier.
 * Avoid dropping distinct publishers/events merely because titles are similar.
 */
export function canonicalNewsUrl(value) {
  if(typeof value!=='string'||value.length>2048)return null;
  let url;
  try {url=new URL(value);}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password)return null;
  url.hash='';
  const tracking=/^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|_gl)$/i;
  const params=[...url.searchParams.entries()]
    .filter(([name])=>!tracking.test(name))
    .sort(([ak,av],[bk,bv])=>ak.localeCompare(bk)||av.localeCompare(bv));
  url.search='';
  for(const [key,value] of params)url.searchParams.append(key,value);
  // In RSS these commonly address the same article. Preserve meaningful IDs.
  if(url.pathname!=='/')url.pathname=url.pathname.replace(/\/+$/,'');
  return url.href;
}

export function normalizedHeadline(title) {
  return String(title||'').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim().slice(0,110);
}

const STRONG=/(?:strike|attack|missile|drone|aircraft|fighter|jet|carrier|military|evacuat|nuclear|deal|talk|negotiat|ceasefire|border|rocket|explos|killed|injur|dead|warning|alert|intercept|threat|sanction|deploy|security)|\bwar(?:s)?\b/i;
export function isStrongTitle(title) {
  return STRONG.test(String(title||''));
}
export function articlePriority(feedWeight,title,regionInTitle) {
  return Number(feedWeight||0)+(regionInTitle?3:0)+(isStrongTitle(title)?3:0)
    -(/opinion|as it happened/i.test(String(title||''))?3:0);
}
