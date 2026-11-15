import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCentcomRss} from './candidate.mjs';
import {slot,fixture} from './baseline.test.mjs';

test('candidate preserves CENTCOM item identity and decodes named entities',()=>{
  const r=parseCentcomRss(fixture(),slot);
  assert.equal(r.entries.length,1);
  assert.equal(r.entries[0].payload.title,'Official notice & update');
  assert.equal(r.entries[0].payload.source_type,'official_centcom_news_rss');
  assert.equal(r.entries[0].payload.published_at,'2026-11-15T19:00:00.000Z');
});
test('candidate handles harmless namespaced RSS item without losing identity',()=>{
  const xml=fixture({itemTag:'x:item',title:'השירות &amp; הבדיקה'}).replace('<rss version="2.0">','<rss version="2.0" xmlns:x="urn:example">');
  const r=parseCentcomRss(xml,slot);
  assert.equal(r.entries.length,1);
  assert.equal(r.entries[0].payload.title,'השירות & הבדיקה');
});
test('candidate rejects DTD and malicious or malformed XML before parsing',()=>{
  const bad=['<!DOCTYPE rss [<!ENTITY long "xxxxxxxxxxxx">]>'+fixture(),'<rss><channel><item><title>A</title></rss>'];
  for (const xml of bad) assert.throws(()=>parseCentcomRss(xml,slot));
});
test('candidate does not accept external links, future dates or oversized XML',()=>{
  assert.throws(()=>parseCentcomRss(fixture({link:'https://evil.example/not-centcom'}),slot));
  assert.throws(()=>parseCentcomRss(fixture({date:'Mon, 16 Nov 2026 19:00:00 GMT'}),slot));
  assert.throws(()=>parseCentcomRss(' '.repeat(180_000)+fixture(),slot));
});
test('candidate preserves honest stale-state instead of emitting current event',()=>{
  const result=parseCentcomRss(fixture({date:'Sun, 01 Nov 2026 19:00:00 GMT'}),slot);
  assert.equal(result.entries.length,1);
  const stale=parseCentcomRss(fixture({date:'Thu, 01 Oct 2026 19:00:00 GMT'}),slot);
  assert.equal(stale.entries.length,0);
  assert.deepEqual(stale.missing,['recent_publications']);
});
