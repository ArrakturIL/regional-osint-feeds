import unittest
from datetime import datetime, timedelta, timezone
from itertools import combinations
from news_event_filter import (analyze,canon,cluster_articles,diversified,
                               report,same_event,tokens)

BASE=datetime(2026,11,12,8,0,tzinfo=timezone.utc)

def article(label,slug,publisher,headline,summary="",hours=0,language="en",kind="news",
            parent_agency=None):
    row={"test_label":label,"canonical":f"https://{publisher}.example.org/{slug}",
         "publisher":publisher,"source":publisher,"headline":headline,
         "summary":summary,"language":language,"kind":kind,
         "published":(BASE+timedelta(hours=hours)).isoformat()}
    if parent_agency:row["parent_agency"]=parent_agency
    return row

def gold_corpus():
    return [
      article("nasser","h1","toi",
        "Israeli strike on Nasser Hospital in Gaza kills five",
        "Israeli strike hit Nasser hospital in Gaza; IDF reports a Hamas target."),
      article("nasser","h2","jpost",
        "IDF strikes Hamas commander at Gaza hospital",
        "IDF says an attack hit Nasser Hospital in Gaza.",hours=1),
      article("nasser","h3","maariv",
        "תקיפה בבית החולים נאסר בעזה: חמישה הרוגים",
        "ישראל הודיעה על תקיפה של חמאס בבית החולים נאסר בעזה.",hours=2,language="he"),
      article("nasser","h4","aljazeera",
        "قصف مستشفى ناصر في غزة يسفر عن مقتل خمسة",
        "قصف مستشفى ناصر في غزة بعد إعلان إسرائيل عن الهجوم.",hours=2,language="ar"),
      article("shifa","shifa","bbc",
        "Israeli strike hits Al-Shifa Hospital in Gaza",
        "A separate strike on Shifa Hospital in Gaza",hours=1),
      article("nasser-next","h6","bbc",
        "Second Israeli strike at Nasser Hospital in Gaza hours later",
        "Another IDF strike on Nasser Hospital in Gaza, separate incident.",hours=14),
      article("nasser-later","h5","bbc",
        "Another Israeli strike hits Nasser Hospital in Gaza two days later",
        "Nasser Hospital in Gaza affected again.",hours=50),
      article("ghalibaf-deal","gh1","jpost",
        "Ghalibaf says Iran is open to nuclear deal with US talks",
        "Ghalibaf proposed a nuclear agreement in negotiations with the US",hours=4),
      article("ghalibaf-deal","gh2","israelhayom",
        "קאליבאף: איראן פתוחה להסכם גרעין בשיחות עם ארה״ב",
        "קאליבאף מדבר על הסכם גרעין לאיראן.",hours=5,language="he"),
      article("ghalibaf-truce","gh3","aljazeera",
        "Ghalibaf calls for ceasefire negotiations in Iran",
        "A separate ceasefire discussion.",hours=5),
      article("vance","v1","toi",
        "Vance weighing direct nuclear talks with Iran",
        "The US vice president Vance may discuss a nuclear agreement.",hours=4),
      article("missiles","m1","jpost",
        "Iran can build 50 ballistic missiles per month",
        "Military assessment says Iran retains capacity to produce missiles.",hours=7),
      article("missiles","m2","toi",
        "Iran can build 50 ballistic missiles every month",
        "A report says Iran manufactures 50 missiles per month.",hours=8),
      article("nuclear-report","r1","guardian",
        "Reuters: Iran and US agree nuclear deal after talks",
        "According to Reuters, Iran and US agreed to a new deal.",hours=9),
      article("nuclear-report","r2","jns",
        "Iran and US agree nuclear deal after talks, Reuters",
        "Reuters reports Iran and US reached the deal.",hours=10),
      article("politics","p1","toi",
        "Israel coalition talks restart amid election uncertainty",
        "Israeli parties consider government formation.",hours=12),
      article("military-other","m3","bbc",
        "Israel orders new air defense deployment near Lebanon",
        "Israeli air defense missiles deployed near Lebanon.",hours=11),
      article("held","fashion","jpost",
        "Shenkar showcases Israeli fashion in Tel Aviv",
        "New Israeli fashion week presentation.",hours=11),
      article("held","warsaw","bbc",
        "Warsaw opens Israel history exhibit",
        "Museum opening in Warsaw today",hours=11),
      article("held","opinion","toi",
        "Israel opinion: why we should negotiate with Iran",
        "Opinion column",hours=13,kind="opinion"),
      article("held","sponsored","jpost",
        "Sponsored Israel missile insurance promotion",
        "Sponsored offer.",hours=11,kind="sponsored"),
      article("held","livex","aljazeera",
        "Live blog: Israel and Iran ceasefire negotiations",
        "Rolling updates.",hours=11,kind="liveblog")
    ]

def pair_metrics(rows,events):
    actual=set()
    for cluster in events:
        slugs=[r["canonical"].split("/")[-1] for r in cluster["articles"]]
        actual.update(tuple(sorted(p)) for p in combinations(slugs,2))
    expected=set()
    for a,b in combinations((r for r in rows if r["test_label"]!="held"),2):
        if a["test_label"]==b["test_label"]:
            expected.add(tuple(sorted((a["canonical"].split("/")[-1],
                                       b["canonical"].split("/")[-1]))))
    tp=len(actual&expected)
    fp=len(actual-expected)
    fn=len(expected-actual)
    precision=tp/max(tp+fp,1)
    recall=tp/max(tp+fn,1)
    return {"tp":tp,"fp":fp,"fn":fn,"precision":precision,"recall":recall}

class FilterTests(unittest.TestCase):
    def test_english_hebrew_arabic_hospital_same_event(self):
        events,_=cluster_articles(gold_corpus())
        group=next(e for e in events if any(r["test_label"]=="nasser" for r in e["articles"]))
        self.assertEqual(group["member_count"],4)
        self.assertEqual(group["publisher_count"],4)
        self.assertEqual(group["verification"],"multi_outlet_reporting")
        self.assertFalse(group["public_release_allowed"])
        self.assertNotEqual(group["verification"],"confirmed")

    def test_shifa_and_later_strike_not_merged(self):
        ev,_=cluster_articles(gold_corpus())
        names={r["test_label"] for e in ev for r in e["articles"]}
        self.assertIn("shifa",names)
        self.assertIn("nasser-later",names)
        for e in ev:
            labels={r["test_label"] for r in e["articles"]}
            self.assertFalse("nasser" in labels and "shifa" in labels)
            self.assertFalse("nasser" in labels and "nasser-later" in labels)
            self.assertFalse("nasser" in labels and "nasser-next" in labels)

    def test_cross_language_named_actor_and_matching_subject(self):
        ev,_=cluster_articles(gold_corpus())
        gh=next(e for e in ev if any(r["test_label"]=="ghalibaf-deal" for r in e["articles"]))
        self.assertEqual(gh["member_count"],2)
        self.assertIn("same_actor_subtopic_short_window",gh["reason_codes"])
        self.assertFalse(any(r["test_label"]=="ghalibaf-truce" for r in gh["articles"]))
        self.assertFalse(any(r["test_label"]=="vance" for r in gh["articles"]))

    def test_two_reuters_reprints_are_one_reporting_origin(self):
        ev,_=cluster_articles(gold_corpus())
        sample=next(e for e in ev if any(r["test_label"]=="nuclear-report" for r in e["articles"]))
        self.assertEqual(sample["member_count"],2)
        self.assertEqual(sample["publisher_count"],2)
        self.assertEqual(sample["reporting_origin_count"],1)
        self.assertEqual(sample["verification"],"single_origin_reporting")

    def test_irrelevant_opinion_sponsored_and_liveblog_held(self):
        ev,held=cluster_articles(gold_corpus())
        self.assertEqual(len(held),5)
        self.assertEqual(len([e for e in ev if e["topic"]=="strike"]),4)
        kinds={a["selection_policy"] for a in held}
        self.assertIn("hold_nonnews",kinds)
        self.assertIn("hold_low_signal",kinds)
        self.assertFalse(any(a["test_label"]=="held" for e in ev for a in e["articles"]))

    def test_url_canonicalization_preserves_meaningful_id(self):
        a=canon("https://x.test/news/?utm_source=abc&id=1#section")
        b=canon("https://x.test/news?id=1&utm_source=cde")
        self.assertEqual(a,b)
        self.assertNotEqual(a,canon("https://x.test/news?id=2"))
        self.assertIsNone(canon("http://x.test/news?id=1"))

    def test_missing_dates_never_merge_by_same_title(self):
        x=analyze(article("x","x","jpost","Iran missile strike reported"))
        y=analyze(article("x","y","toi","Iran missile strike reported"))
        x["timestamp"]=None
        self.assertEqual(same_event(x,y),(False,"missing_publication_time"))

    def test_israeli_governance_and_un_diplomacy(self):
        residence=analyze(article("budget","bu","toi",
            "Netanyahu home repairs funded by Israeli state budget",
            "Israeli taxpayer funding for Netanyahu residence."))
        self.assertEqual(residence["topic"],"governance")
        self.assertEqual(residence["selection_policy"],"candidate")
        council=analyze(article("council","un","bbc",
            "UN Security Council calls emergency session on Gaza and Israel",
            "UN diplomatic officials discuss Israel and Gaza."))
        self.assertEqual(council["topic"],"diplomacy")
        self.assertEqual(council["selection_policy"],"candidate")
        theater=analyze(article("theater","fa","jpost",
            "Israel theater festival starts with Netanyahu portrait",
            "The performance is in Tel Aviv."))
        self.assertEqual(theater["selection_policy"],"hold_low_signal")

    def test_no_war_keyword_in_warsaw(self):
        a=analyze(article("x","w","bbc","Warsaw opens Israel history exhibit"))
        self.assertEqual(a["topic"],"other")
        self.assertEqual(a["selection_policy"],"hold_low_signal")
        self.assertEqual(a["score"],2)

    def test_conservative_precision_recall(self):
        rows=gold_corpus()
        ev,_=cluster_articles(rows)
        metrics=pair_metrics(rows,ev)
        self.assertGreaterEqual(metrics["precision"],0.95,metrics)
        self.assertGreaterEqual(metrics["recall"],0.85,metrics)
        print("EVAL_PRECISION_RECALL",metrics)

    def test_shadow_report_only_metadata(self):
        rows=gold_corpus()
        aggregate=report(rows)
        self.assertEqual(aggregate["mode"],"shadow_only_never_publish")
        self.assertFalse(aggregate["public_release_allowed"])
        self.assertGreater(aggregate["suppressed_duplicate_cards"],0)
        import json
        self.assertNotIn("Ghalibaf",json.dumps(aggregate))
        self.assertNotIn("Al-Shifa",json.dumps(aggregate))

    def test_diversity_does_not_censor_urgent_items(self):
        ev,_=cluster_articles(gold_corpus())
        selected=diversified(ev,limit=8,per_owner=0.2)
        self.assertLessEqual(len(selected),8)
        self.assertTrue(any(e["topic"]=="strike" for e in selected))

if __name__=="__main__":
    unittest.main()
