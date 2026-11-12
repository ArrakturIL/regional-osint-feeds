#!/usr/bin/env python3
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec=importlib.util.spec_from_file_location("analysts",Path(__file__).with_name("collect_analysts.py"))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
NOW=datetime(2026,11,11,21,0,tzinfo=timezone.utc)
TELE={"id":"auslender-telegram","type":"telegram_public","canonical_prefix":"https://t.me/voinasordoy/"}
YT={"id":"auslender-youtube","type":"youtube_rss","canonical_prefix":"https://www.youtube.com/watch?v=","channel_id":"UCygnHvXjsEa_gLMH-WmzeXQ"}

class Tests(unittest.TestCase):
 def test_telegram_only_signed_post(self):
  raw='<html><div class="tgme_widget_message js-widget_message" data-post="voinasordoy/124"><div class="tgme_widget_message_text js-message_text">Обзор Ирана <b>и Израиля</b>. Развитие событий в регионе.</div><time datetime="2026-11-11T19:20:00+00:00">19:20</time></div><div data-post="other/111" class="tgme_widget_message"><div class="tgme_widget_message_text">NOT OUR CONTENT</div></div></html>'
  got=m.telegram_posts(raw,TELE,"sergey-auslender",NOW)
  self.assertEqual(len(got),1)
  self.assertEqual(got[0]["canonical_url"],"https://t.me/voinasordoy/124")
  self.assertEqual(got[0]["text_status"],"full_text")
  self.assertIn("Израиля",got[0]["body"])
 def test_forwarded_skipped(self):
  raw='<div class="tgme_widget_message" data-post="voinasordoy/125"><div class="tgme_widget_message_forwarded_from_name">Other</div><div class="tgme_widget_message_text">Copied</div><time datetime="2026-11-11T19:20:00+00:00"></time></div>'
  self.assertEqual(m.telegram_posts(raw,TELE,"a",NOW),[])
 def test_youtube_metadata_never_full_text(self):
  xml='''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><id>yt:channel:UCygnHvXjsEa_gLMH-WmzeXQ</id><entry><yt:videoId>abcdefghijk</yt:videoId><published>2026-11-11T20:00:00Z</published><title>Иран и Израиль</title></entry></feed>'''
  got=m.youtube_posts(xml,YT,"sergey-auslender",NOW)
  self.assertEqual(len(got),1)
  self.assertEqual(got[0]["text_status"],"metadata_only")
  self.assertEqual(got[0]["body"],"")
 def test_youtube_500_retry_then_success(self):
  url='https://www.youtube.com/feeds/videos.xml?channel_id=UCygnHvXjsEa_gLMH-WmzeXQ'
  class FakeResponse:
   url='https://www.youtube.com/feeds/videos.xml?channel_id=UCygnHvXjsEa_gLMH-WmzeXQ'
   status=200
   headers={'Content-Type':'application/atom+xml'}
   def __enter__(self):return self
   def __exit__(self,*args):return False
   def read(self,n):return b'<feed/>'
  error=HTTPError(url,500,'Internal Server Error',{},None)
  with patch.object(m.urllib.request,'urlopen',side_effect=[error,FakeResponse()]) as mocked:
   with patch.object(m.time,'sleep') as sleep:
    body,status=m.fetch_public(url)
  self.assertEqual((body,status),('<feed/>',200))
  self.assertEqual(mocked.call_count,2)
  sleep.assert_called_once_with(1)
 def test_youtube_429_never_retried(self):
  url='https://www.youtube.com/feeds/videos.xml?channel_id=UCygnHvXjsEa_gLMH-WmzeXQ'
  error=HTTPError(url,429,'Too Many Requests',{},None)
  with patch.object(m.urllib.request,'urlopen',side_effect=error) as mocked:
   with patch.object(m.time,'sleep') as sleep:
    with self.assertRaises(HTTPError):m.fetch_public(url)
  self.assertEqual(mocked.call_count,1)
  sleep.assert_not_called()
 def test_disallowed_private_url(self):
  for url in ["http://t.me/s/voinasordoy","https://evil.example/path","https://t.me/private?secret=true"]:
   with self.assertRaises(ValueError):m.fetch_public(url)
 def test_unknown_markup_is_failure(self):
  with self.assertRaises(ValueError):m.telegram_posts("<html>no posts</html>",TELE,"a",NOW)

 def test_rss_author_verified_only(self):
  rss='''<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>RUSI</title>
  <item><title>Air power and strategy</title><link>https://www.rusi.org/article/air-power</link>
  <pubDate>Wed, 11 Nov 2026 20:00:00 +0000</pubDate><dc:creator>Justin Bronk</dc:creator>
  <description>Brief metadata: not full text.</description></item>
  <item><title>Other commentary</title><link>https://www.rusi.org/article/other</link>
  <pubDate>Wed, 11 Nov 2026 20:01:00 +0000</pubDate><dc:creator>Another Person</dc:creator></item>
  </channel></rss>'''
  src={"id":"bronk-rusi-rss","type":"rss_author","canonical_prefix":"https://www.rusi.org/","author_match":"Justin Bronk","language":"en"}
  found=m.rss_author_posts(rss,src,"justin-bronk",NOW)
  self.assertEqual(len(found),1)
  self.assertEqual(found[0]["body"],"")
  self.assertEqual(found[0]["text_status"],"metadata_only")
  self.assertEqual(found[0]["language"],"en")
  self.assertEqual(found[0]["title"],"Air power and strategy")
 def test_rss_other_host_rejected(self):
  rss='''<rss><channel><item><title>A title</title><link>https://random.example/blog</link>
  <pubDate>Wed, 11 Nov 2026 20:00:00 GMT</pubDate><author>Tom Karako</author></item></channel></rss>'''
  src={"id":"karako-missile-threat-rss","type":"rss_author","canonical_prefix":"https://missilethreat.csis.org/","author_match":"Tom Karako","language":"en"}
  self.assertEqual(m.rss_author_posts(rss,src,"tom-karako",NOW),[])
 def test_rss_rejects_html_document(self):
  with self.assertRaises(ValueError):
   m.rss_author_posts("<html><body>not a feed</body></html>",{"author_match":"Justin Bronk"},"a",NOW)

if __name__=="__main__":unittest.main()