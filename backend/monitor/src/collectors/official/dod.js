import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
import { textOnly } from '../../utils/text.js';
export const US_DOD_RSS_URL="https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10";
export async function dodOfficialRss(){
  const xml=await get(US_DOD_RSS_URL,"text");
  if(!/<rss\b/i.test(xml)||!/<item\b/i.test(xml))throw new Error("unexpected US DoD news RSS response");
  const entries=[];
  for(const [,body]of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
    const field=tag=>textOnly(body.match(new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)</"+tag+">","i"))?.[1]);
    const title=field("title");
    if(!title||!/\b(centcom|central command|iran|israel|iraq|syria|lebanon|hormuz|middle east|red sea|gulf|missile|air defense|evacuat|counterterrorism|force posture)\b/i.test(title))continue;
    let url=null;
    try{const u=new URL(field("link"),US_DOD_RSS_URL);if(u.protocol==="https:"&&["www.war.gov","war.gov","www.defense.gov","defense.gov"].includes(u.hostname))url=u.href;}catch{}
    if(!url)continue;
    entries.push(item(url,{url,title,published_at:field("pubDate")||null,
      source_feed:US_DOD_RSS_URL,source_type:"US Department of Defense official RSS (not exclusively CENTCOM)",
      caveat:"General Pentagon RSS; only overlapping subjects extracted. Absence is not evidence of inactivity by CENTCOM."}));
    if(entries.length>=10)break;
  }
  return entries;
}

