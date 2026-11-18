import unittest
from datetime import datetime, timezone

from collect_news_shadow import canonical,feed_items,parsed_date,category,relevant,score,audit_one,build_report

NOW=datetime(2026,11,12,12,0,tzinfo=timezone.utc)

RSS=b"""<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>test</title>
<item><title>Israel and Iran discuss ceasefire</title>
<link>https://example.org/a?id=1&amp;utm_source=foo</link>
<description>News report</description><pubDate>Thu, 12 Nov 2026 11:00:00 GMT</pubDate></item>
<item><title>Warsaw opens library</title><link>https://example.org/warsaw</link>
<description>Public library</description><pubDate>Thu, 12 Nov 2026 11:00:00 GMT</pubDate></item>
</channel></rss>"""
ATOM="""<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>ישראל ואיראן פתחו במשא ומתן</title>
<link rel="alternate" href="https://example.org/he/1" />
<summary>עדכוני חדשות על ישראל</summary><updated>2026-11-12T11:02:00Z</updated></entry>
<entry><title>إيران وإسرائيل تتفاوضان على الهدنة</title>
<link href="https://example.org/ar/1" /><published>2026-11-12T11:05:00Z</published></entry>
</feed>"""

def source(id,language='en'):
    return {"id":id,"publisher":id,"language":language,
            "feed_url":"https://example.org/feed",
            "license_status":"pending_terms_review","probe":True}

class Tests(unittest.TestCase):
    def test_rss_and_rdf_guard(self):
        rows=feed_items(RSS)
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]["published"],"Thu, 12 Nov 2026 11:00:00 GMT")
        self.assertTrue(relevant(rows[0]))
        self.assertFalse(relevant(rows[1]))
        self.assertEqual(score(rows[1])[0],0)
        self.assertEqual(score(rows[0])[0],6)

    def test_atom_hebrew_arabic_supported(self):
        rows=feed_items(ATOM)
        self.assertEqual(len(rows),2)
        self.assertTrue(all(relevant(x) for x in rows))
        self.assertTrue(all(score(x)[0]>=3 for x in rows))
        self.assertTrue(rows[0]["link"].startswith("https://"))
        self.assertEqual(parsed_date(rows[1]["published"]),datetime(2026,11,12,11,5,tzinfo=timezone.utc))

    def test_canonical_params_and_anchor(self):
        x="https://example.org/article/?utm_source=x&id=1#section"
        y="https://example.org/article?id=1&utm_source=y"
        self.assertEqual(canonical(x),canonical(y))
        self.assertNotEqual(canonical(y),canonical("https://example.org/article?id=2"))
        self.assertIsNone(canonical("http://example.org/article?id=1"))

    def test_malformed_xml_fails_only_its_feed(self):
        def fetcher(s):
            if s["id"]=="bad":raise ValueError("broken feed")
            return feed_items(RSS)
        registry={"sources":[source("good"),source("bad")]}
        report=build_report(registry,NOW,fetcher)
        self.assertEqual(report["source_count"],2)
        self.assertEqual(report["ok_sources"],1)
        self.assertTrue(report["partial"])
        self.assertEqual(report["canonical_articles"],1)

    def test_no_full_headlines_in_report(self):
        report=build_report({"sources":[source("one")]},NOW,lambda s:feed_items(RSS))
        import json
        payload=json.dumps(report,ensure_ascii=False)
        self.assertNotIn("Israel and Iran discuss ceasefire",payload)
        self.assertNotIn("Warsaw opens library",payload)

    def test_no_forced_merge_across_languages(self):
        results=[source("he","he"),source("ar","ar")]
        report=build_report({"sources":results},NOW,
                            lambda s:feed_items(ATOM if s["language"] in ("he","ar") else RSS))
        self.assertEqual(report["ok_sources"],2)
        self.assertEqual(report["canonical_articles"],2)
        self.assertEqual(report["headline_groups"],2)

    def test_opinion_and_liveblog_not_published(self):
        self.assertEqual(category("Commentary: Iran deal"),"opinion")
        self.assertEqual(category("Iran as it happened"),"liveblog")
        self.assertEqual(category("תוכן ממומן: ישראל"),"sponsored")
        self.assertEqual(category("Iran reaches deal"),"news")

    def test_date_freshness(self):
        def f(s):
            return [{"title":"Israel Iran missile",
                     "summary":"Iran",
                     "link":"https://example.org/old",
                     "published":"Thu, 05 Nov 2026 11:00:00 GMT"}]
        state,items=audit_one(source("old"),NOW,f)
        self.assertEqual(state["state"],"ok")
        self.assertEqual(items,[])
        self.assertEqual(state["eligible"],0)

    def test_unapproved_sources_not_probed(self):
        s=source("candidate");s["probe"]=False
        result=build_report({"sources":[s]},NOW,lambda _s:[])
        self.assertEqual(result["source_count"],0)
        self.assertEqual(result["ok_sources"],0)


    def test_registry_identifies_current_production_feeds_without_licensing_claim(self):
        """Shadow metadata must describe the existing live feed list, not grant rights (E-04)."""
        import json
        import re
        from pathlib import Path
        root=Path(__file__).resolve().parents[1]
        registry=json.loads((root/"config/news-source-registry.json").read_text(encoding="utf-8"))
        import subprocess
        # Read the real module (formatting-independent since #8a Prettier), not a regex over source text.
        events=(root/"backend/editor/src/news/events.mjs").as_uri()
        out=subprocess.run(["node","--input-type=module","-e",
            "const m=await import(process.argv[1]);process.stdout.write(JSON.stringify(m.FEEDS))",events],
            capture_output=True,text=True,timeout=30)
        self.assertEqual(out.returncode,0,"active Editor feeds contract missing: "+out.stderr[-300:])
        feeds=json.loads(out.stdout)
        self.assertTrue(feeds,"Editor must define production feeds")
        by_url={s.get("feed_url"):s for s in registry["sources"] if s.get("feed_url")}
        self.assertEqual(len(by_url),sum(bool(s.get("feed_url")) for s in registry["sources"]),"duplicate registry feed URLs")
        active_urls={entry[1] for entry in feeds}
        self.assertEqual(len(active_urls),len(feeds),"duplicate active feed URLs")
        for name,url,*_ in feeds:
            with self.subTest(active=name):
                self.assertIn(url,by_url)
                registered=by_url[url]
                self.assertEqual(registered["origin"],"existing_production")
                self.assertIs(registered["public_enabled"],True)
        for entry in registry["sources"]:
            if entry.get("feed_url") not in active_urls:
                with self.subTest(candidate=entry["id"]):
                    self.assertIs(entry["public_enabled"],False)
        # Runtime use is not a terms-of-service approval: every status is one of
        # the documented values, and a restrictive or reviewed status cites its evidence.
        allowed=set(registry["license_status_values"])
        for entry in registry["sources"]:
            with self.subTest(license=entry["id"]):
                self.assertIn(entry["license_status"],allowed)
                if entry["license_status"].startswith(("restrictive_written","restrictive_link","personal_")):
                    self.assertTrue(entry.get("license_evidence","").startswith("https://"))
                    self.assertEqual(entry.get("license_reviewed"),"2026-11-18")

if __name__=="__main__":unittest.main()
