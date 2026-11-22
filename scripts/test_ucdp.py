import io
import json
import tempfile
import unittest
import urllib.error
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock

from scripts import collect_ucdp as u


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def page(result, nxt=""):
    return Resp(json.dumps({"TotalCount": len(result), "Result": result, "NextPageUrl": nxt}).encode())


def event(i, gw, day, best=1, civ=0, kind=1):
    return {"id": i, "country_id": gw, "date_end": day, "best": best, "deaths_civilians": civ,
            "type_of_violence": kind, "country": "X", "where_description": "w", "side_a": "a", "side_b": "b"}


class Opener:
    """Fake urlopen: answers by URL, records headers, raises HTTPError codes."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    def __call__(self, req, timeout=None):
        self.calls.append(req)
        url = req.full_url
        for key, answer in self.routes:
            if key in url:
                if isinstance(answer, int):
                    raise urllib.error.HTTPError(url, answer, "x", {}, None)
                return answer() if callable(answer) else answer
        raise urllib.error.HTTPError(url, 404, "x", {}, None)


class UcdpTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.patches = [mock.patch.object(u, "DATA", d), mock.patch.object(u, "SNAP", d / "s.json"),
                        mock.patch.object(u, "STATUS", d / "st.json")]
        for p in self.patches:
            p.start()
        self.now = datetime(2026, 11, 23, 3, 0, tzinfo=timezone.utc)

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def test_next_versions_and_window(self):
        self.assertEqual(u.next_versions("26.0.10"), ["26.0.11", "27.0.1"])
        self.assertEqual(u.next_versions("26.0.12"), ["27.0.1"])
        self.assertEqual(u.window_start(date(2026, 2, 5)), date(2025, 11, 1))

    def test_summarize_groups_by_region_month_and_dedupes(self):
        regions, sample = u.summarize([
            event(1, 666, "2026-10-02", best=3, civ=2),
            event(1, 666, "2026-10-02", best=3, civ=2),
            event(2, 652, "2026-11-01", best=5, kind=2),
            event(3, 999, "2026-11-01"),
        ])
        self.assertEqual(regions["israel"]["2026-10"]["events"], 1)
        self.assertEqual(regions["israel"]["2026-10"]["deaths_civilians"], 2)
        self.assertEqual(regions["lebanon_syria"]["2026-11"]["nonstate"], 1)
        self.assertEqual([s["id"] for s in sample], [2, 1])

    def test_collect_sends_token_follows_pages_and_writes_pair(self):
        p2 = "https://ucdpapi.pcr.uu.se/api/gedevents/26.0.10?page=1"
        op = Opener([("26.0.11", 404), ("27.0.1", 404), ("page=1", lambda: page([event(2, 645, "2026-11-10")])),
                     ("26.0.10", lambda: page([event(1, 666, "2026-11-09")], p2))])
        self.assertEqual(u.collect("tok", op, self.now), 0)
        self.assertTrue(all(r.get_header("X-ucdp-access-token") == "tok" for r in op.calls))
        data = json.loads(u.SNAP.read_text())
        self.assertEqual(data["events_total"], 2)
        self.assertEqual(data["window"], {"start": "2026-08-01", "end": "2026-11-23"})
        st = json.loads(u.STATUS.read_text())
        self.assertEqual((st["state"], st["requests"]), ("ok", 4))

    def test_newer_release_is_adopted(self):
        op = Opener([("26.0.11?pagesize=1&", lambda: page([event(9, 666, "2026-11-01")])),
                     ("26.0.11?pagesize=1000", lambda: page([event(9, 666, "2026-11-01")]))])
        self.assertEqual(u.collect("tok", op, self.now), 0)
        self.assertEqual(json.loads(u.STATUS.read_text())["version"], "26.0.11")

    def test_auth_error_stops_at_once_and_keeps_previous_snapshot(self):
        u.SNAP.write_text('{"old": true}')
        op = Opener([("gedevents", 401)])
        self.assertEqual(u.collect("bad", op, self.now), 1)
        self.assertEqual(len(op.calls), 1)
        self.assertEqual(json.loads(u.SNAP.read_text()), {"old": True})
        self.assertEqual(json.loads(u.STATUS.read_text())["state"], "error")

    def test_unreleased_version_answering_400_is_skipped_without_retry(self):
        op = Opener([("26.0.11", 400), ("27.0.1", 400), ("26.0.10", lambda: page([event(1, 666, "2026-11-09")]))])
        self.assertEqual(u.collect("tok", op, self.now), 0)
        self.assertEqual(len(op.calls), 3)

    def test_server_error_retried_once_then_fails(self):
        op = Opener([("26.0.11", 404), ("27.0.1", 404), ("26.0.10", 500)])
        self.assertEqual(u.collect("tok", op, self.now), 1)
        self.assertEqual(len(op.calls), 4)

    def test_missing_token_makes_no_requests(self):
        op = Opener([])
        self.assertEqual(u.collect("", op, self.now), 1)
        self.assertEqual(op.calls, [])

    def test_foreign_next_page_host_rejected(self):
        op = Opener([("26.0.11", 404), ("27.0.1", 404), ("26.0.10", lambda: page([], "https://evil.example/api/gedevents/x"))])
        self.assertEqual(u.collect("tok", op, self.now), 1)


if __name__ == "__main__":
    unittest.main()
