#!/usr/bin/env python3
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import json
import unittest

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
 def test_disallowed_private_url(self):
  for url in ["http://t.me/s/voinasordoy","https://evil.example/path","https://t.me/private?secret=true"]:
   with self.assertRaises(ValueError):m.fetch_public(url)
 def test_unknown_markup_is_failure(self):
  with self.assertRaises(ValueError):m.telegram_posts("<html>no posts</html>",TELE,"a",NOW)

if __name__=="__main__":unittest.main()