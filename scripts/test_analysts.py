from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import unittest
p=Path(__file__).with_name("collect_analysts.py")
spec=importlib.util.spec_from_file_location("analysts",p)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW=datetime(2026,11,11,21,0,tzinfo=timezone.utc)
TELE={"id":"auslender-telegram","canonical_prefix":"https://t.me/voinasordoy/"}
YT={"id":"auslender-youtube","channel_id":"UCygnHvXjsEa_gLMH-WmzeXQ",
    "canonical_prefix":"https://www.youtube.com/watch?v="}
class Tests(unittest.TestCase):
    def test_original_telegram(self):
        h='<div class="tgme_widget_message js-widget_message" data-post="voinasordoy/123"><div class="tgme_widget_message_text">Обзор <b>Ирана</b> и Израиля</div><time datetime="2026-11-11T20:00:00+00:00"></time></div>'
        v=m.telegram_posts(h,TELE,"sergey-auslender",NOW)
        self.assertEqual(len(v),1)
        self.assertIn("Ирана",v[0]["body"])
        self.assertEqual(v[0]["canonical_url"],"https://t.me/voinasordoy/123")
        self.assertEqual(v[0]["text_status"],"full_text")
    def test_forwarded_and_other_channel_skipped(self):
        h='<div class="tgme_widget_message" data-post="voinasordoy/124"><div class="tgme_widget_message_forwarded_from_name">Other channel</div><div class="tgme_widget_message_text">Copied</div><time datetime="2026-11-11T20:00:00Z"></time></div>'
        self.assertEqual(m.telegram_posts(h,TELE,"a",NOW),[])
        self.assertEqual(m.telegram_posts(h.replace("voinasordoy/","other/"),TELE,"a",NOW),[])
    def test_youtube_metadata_not_transcript(self):
        h='<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><id>yt:channel:UCygnHvXjsEa_gLMH-WmzeXQ</id><entry><yt:videoId>abcdefghijk</yt:videoId><published>2026-11-11T20:00:00Z</published><title>Тема Ирана</title></entry></feed>'
        v=m.youtube_posts(h,YT,"a",NOW)
        self.assertEqual(v[0]["body"],"")
        self.assertEqual(v[0]["text_status"],"metadata_only")
    def test_invalid_source_markup(self):
        with self.assertRaises(ValueError):m.telegram_posts("<html></html>",TELE,"a",NOW)
    def test_bad_origin_never_fetched(self):
        for s in ["http://t.me/s/x","https://evil.com/path","https://t.me/private?k=1"]:
            with self.assertRaises(ValueError):m.load_url(s)
if __name__=="__main__":unittest.main()
