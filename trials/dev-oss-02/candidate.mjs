// DEV-OSS-02 trial ONLY. Not imported by the production Monitor Worker.
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {textOnly,href} from '../../backend/monitor/src/utils/text.js';

const FEED='https://www.centcom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=808&max=20';
const HOUR=3_600_000, MINUTE=60_000, MAX_BYTES=128_000;

export function parseCentcomRss(xml,slot){
  if(typeof xml!=='string'||!Number.isFinite(slot)||new TextEncoder().encode(xml).byteLength>MAX_BYTES)
    throw Error('invalid CENTCOM XML input');
  // DTDs are neither necessary for this feed nor appropriate for untrusted HTTP.
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))throw Error('CENTCOM XML DTD disabled');
  if(XMLValidator.validate(xml)!==true)throw Error('invalid CENTCOM XML syntax');
  const parsed=new XMLParser({removeNSPrefix:true,parseTagValue:false,processEntities:true,trimValues:true,ignoreAttributes:false}).parse(xml);
  const channel=parsed?.rss?.channel;
  if(!channel || typeof channel !== 'object')throw Error('unexpected CENTCOM RSS structure');
  const input=Array.isArray(channel.item)?channel.item:channel.item?[channel.item]:[];
  const valid=[];
  for(const row of input.slice(0,50)){
    if(!row || typeof row!=='object')continue;
    const title=textOnly(typeof row.title==='string'?row.title:'');
    const url=href(typeof row.link==='string'?row.link:'',FEED);
    const published=Date.parse(typeof row.pubDate==='string'?row.pubDate:'');
    if(!title||!url||!Number.isFinite(published)||published>slot+5*MINUTE)continue;
    valid.push({id:String(url),payload:{url,title,published_at:new Date(published).toISOString(),
      source_feed:FEED,source_type:'official_centcom_news_rss',
      caveat:'Official news RSS only; may be archival. Poll time is not publication time; not a complete operations or press-release feed.'}});
  }
  if(!valid.length)throw Error('unexpected CENTCOM RSS: no valid official dated items');
  const newest=Math.max(...valid.map(x=>Date.parse(x.payload.published_at)));
  const entries=valid.filter(x=>Date.parse(x.payload.published_at)>=slot-30*24*HOUR);
  return {entries,missing:entries.length?[]:['recent_publications'],detail:entries.length?null:
    'RSS reachable but archival; latest publication '+new Date(newest).toISOString()+'; no items within 30 days. Not current coverage.'};
}
