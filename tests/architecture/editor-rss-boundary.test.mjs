import test from 'node:test';
import assert from 'node:assert/strict';
import {entries,load} from '../../backend/editor/src/news/rss.mjs';

const NOW=Date.parse('2026-11-16T00:00:00.000Z');
const FEED=['Reuters','https://feeds.example.invalid/reuters'];
const item=(title,summary,url,published)=>'<item><title>'+title+'</title><description>'+summary+'</description><link>'+url+'</link><pubDate>'+new Date(published).toUTCString()+'</pubDate></item>';

test('RSS item normalization preserves entity decoding, source, score and HTTPS links',()=>{
  const xml='<rss><channel>'+
    item('<![CDATA[Israeli military strikes Iran site &amp; issues alert]]>',
      'Israel military reports air strike on Iranian positions near Tehran.',
      'https://news.example.org/iran?ref=1&amp;lang=en',NOW-60_000)+
    item('Israeli military strikes Iran site','Report','http://news.example.org/insecure',NOW-60_000)+
    '</channel></rss>';
  const rows=entries(xml,FEED,NOW);
  assert.equal(rows.length,1,'only eligible secure news items should survive');
  assert.equal(rows[0].source,'Reuters');
  assert.equal(rows[0].title,'Israeli military strikes Iran site & issues alert');
  assert.equal(rows[0].link,'https://news.example.org/iran?ref=1&lang=en');
  assert.equal(rows[0].pub,NOW-60_000);
  assert.ok(rows[0].score>=4);
});

test('Atom href and published timestamp follow the same URL safety contract',()=>{
  const xml='<feed><entry><title>Israel and Iran exchange military warnings near Tehran</title>'+
    '<summary>Israel warned Iran about new military strikes near Tehran.</summary>'+
    '<link rel="alternate" href="https://news.example.org/atom/story" />'+
    '<updated>'+new Date(NOW-120_000).toISOString()+'</updated></entry></feed>';
  const rows=entries(xml,FEED,NOW);
  assert.equal(rows.length,1);
  assert.equal(rows[0].link,'https://news.example.org/atom/story');
});

test('historical and future item limits and non-news classifications are unchanged',()=>{
  const cases=[
    item('Israel military strikes Iran site','Israeli military strike near Tehran','https://news.example.org/old',NOW-72*3_600_000-1000),
    item('Israel military strikes Iran site','Israeli military strike near Tehran','https://news.example.org/future',NOW+601_000),
    item('Sponsored Israel military briefing about Iran','Advertorial paid content','https://news.example.org/sponsored',NOW-60_000)
  ];
  assert.deepEqual(entries('<rss>'+cases.join('')+'</rss>',FEED,NOW),[]);
  // RSS pubDate encodes whole seconds; the existing +10 min boundary is inclusive.
  const boundary=item('Israel military strikes Iran site','Israeli military strike near Tehran',
    'https://news.example.org/boundary',NOW+600_000);
  assert.equal(entries('<rss>'+boundary+'</rss>',FEED,NOW).length,1);

});

test('feed fetch preserves RSS gate, status, and error without contacting external service',async t=>{
  let requests=0;
  const originalFetch=globalThis.fetch;
  try{
    const payload='<rss><channel>'+item('Israeli military strikes Iran site',
      'Israel military reports strike near Tehran','https://news.example.org/ok',NOW-20_000)+'</channel></rss>';
    globalThis.fetch=async (url,opts)=>{
      requests++;
      assert.equal(url,FEED[1]);
      assert.equal(opts.redirect,'follow');
      assert.equal(opts.headers['User-Agent'],'RegionalWatch/1.0 RSS');
      return new Response(payload,{status:200});
    };
    const ok=await load(FEED,NOW);
    assert.equal(ok.name,'Reuters');
    assert.equal(ok.state,'ok');
    assert.equal(ok.http,200);
    assert.equal(ok.items.length,1);
    assert.equal(requests,1);
    globalThis.fetch=async()=>new Response('<html>not rss</html>',{status:200});
    const invalid=await load(FEED,NOW);
    assert.equal(invalid.state,'error');
    assert.equal(invalid.error,'Not RSS/Atom');
    globalThis.fetch=async()=>new Response('upstream error',{status:503});
    const unavailable=await load(FEED,NOW);
    assert.equal(unavailable.state,'error');
    assert.equal(unavailable.http,503);
    globalThis.fetch=async()=>{throw new Error('network unavailable')};
    const failure=await load(FEED,NOW);
    assert.equal(failure.state,'error');
    assert.equal(failure.http,null);
    assert.ok(failure.error.includes('network unavailable'));
  }finally{globalThis.fetch=originalFetch}
});
