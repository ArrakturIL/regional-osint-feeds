import json
import unittest
from datetime import datetime, timezone

from scripts.site_visitors import rows_for, summarize

ACCOUNT = {
    "last24h": [{"count": 41, "sum": {"visits": 17}}],
    "week": [{"count": 230, "sum": {"visits": 95}}],
    "days": [{"dimensions": {"date": "2026-11-19"}, "count": 120, "sum": {"visits": 50}},
             {"dimensions": {"date": "2026-11-20"}, "count": 110, "sum": {"visits": 45}}],
    "paths": [{"dimensions": {"requestPath": "/"}, "count": 150}],
    "countries": [{"dimensions": {"countryName": "IL"}, "count": 200}],
}
NOW = datetime(2026, 11, 20, 18, 0, tzinfo=timezone.utc)


class SiteVisitors(unittest.TestCase):
    def test_summary_from_graphql(self):
        s = summarize(ACCOUNT, NOW)
        self.assertEqual((s["visits_24h"], s["pageviews_24h"], s["visits_7d"], s["pageviews_7d"]), (17, 41, 95, 230))
        self.assertEqual(s["days"][1], {"date": "2026-11-20", "visits": 45, "pageviews": 110})
        self.assertEqual(s["top_paths"][0]["path"], "/")
        self.assertEqual(s["top_countries"][0]["country"], "IL")

    def test_no_traffic_yet_is_zero_not_error(self):
        s = summarize({"last24h": [], "week": [], "days": [], "paths": [], "countries": []}, NOW)
        self.assertEqual((s["visits_24h"], s["pageviews_7d"], s["days"]), (0, 0, []))

    def test_rows_latest_summary_plus_daily_history(self):
        rows = rows_for(summarize(ACCOUNT, NOW))
        self.assertEqual(rows[0][:3], ("latest", "site_visitors", 17))
        self.assertEqual(json.loads(rows[0][3])["visits_7d"], 95)
        self.assertIn(("2026-11-20", "site_pageviews", 110, ""), rows)

    def test_config_matches_beacon_site(self):
        cfg = json.load(open("config/web-analytics.json"))
        self.assertEqual(cfg["host"], "regional-watch.pages.dev")
        self.assertRegex(cfg["site_tag"], r"^[0-9a-f]{32}$")


if __name__ == "__main__":
    unittest.main()
