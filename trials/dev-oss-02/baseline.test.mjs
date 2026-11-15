import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {textOnly,href} from '../../backend/monitor/src/utils/text.js';

export const slot=Date.parse('2026-11-15T20:00:00Z');
export function fixture({title='Official notice &amp; update', itemTag='item', date='Sun, 15 Nov 2026 19:00:00 GMT', link='https://www.centcom.mil/NEWS/notice', extra=''}={}){
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>CENTCOM</title><${itemTag}><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate>${extra}</${itemTag}></channel></rss>`;
}
export function legacy(xml){
  const src=readFileSync(new URL('../../backend/monitor/src/collectors/official/centcom-rss.js',import.meta.url),'utf8');
  const code=src.replace(/^import\s+[^\n]*\n/gm,'').replace(/^export\s+/gm,'');
  const factory=new Function('HOUR','MINUTE','get','item','href','textOnly', code+'\nreturn centcomRss;');
  const fn=factory(3_600_000,60_000,async()=>xml,(id,payload)=>({id:String(id),payload}),href,textOnly);
  return fn({},slot);
}

test('baseline replays a valid CENTCOM RSS fixture using production source logic',async()=>{
  const result=await legacy(fixture());
  assert.equal(result.entries.length,1);
  assert.equal(result.entries[0].payload.title,'Official notice &amp; update'); // legacy bug: entity remains encoded
  assert.equal(result.entries[0].payload.published_at,'2026-11-15T19:00:00.000Z');
});
test('baseline cannot parse an RSS item with namespace-prefix',async()=>{
  const xml=fixture({itemTag:'x:item'}).replace('<rss version="2.0">','<rss version="2.0" xmlns:x="urn:example">');
  await assert.rejects(legacy(xml),/no valid official dated items/);
});
test('baseline rejects off-origin outgoing links',async()=>{
  await assert.rejects(legacy(fixture({link:'https://evil.example/payload'})),/no valid official dated items/);
});
