"""Q12: offline behaviour of the GitHub Actions ADS-B collector."""
import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from scripts.collect_adsb import (
    FILES, UpstreamError, collect_mil, collect_point, load_config, trim_aircraft, write_pair,
)
from scripts.neon_mirror import load_snapshot

NOW = datetime(2026, 11, 19, 14, 0, tzinfo=timezone.utc)
NOW_MS = int(NOW.timestamp() * 1000)


def plane(hex_id, **extra):
    return {"hex": hex_id, "type": "adsb_icao", "alt_baro": 31000, "gs": 440.1, "squawk": "1234", **extra}


class Fetcher:
    def __init__(self, answers):
        self.answers, self.urls = answers, []

    def __call__(self, url):
        self.urls.append(url)
        for key, answer in self.answers.items():
            if key in url:
                if isinstance(answer, Exception):
                    raise answer
                return answer
        raise AssertionError("unexpected URL " + url)


def collect(fn, answers):
    fetch = Fetcher(answers)
    data, status = fn(load_config(), fetch=fetch, now=lambda: NOW, sleep=lambda s: None)
    return data, status, fetch.urls


class TestPoint(unittest.TestCase):
    def test_all_regions_fetched_with_radius_cap_and_trimmed_aircraft(self):
        body = {"now": NOW_MS, "ac": [plane("4b1803", t="A320", flight="THY7AB  ", dbFlags=0, lat=35.71234, lon=51.4),
                                      plane("4B1803"), plane("bad"), plane("ae1234", t="C17", dbFlags=1)]}
        data, status, urls = collect(collect_point, {"api.adsb.lol/v2/point/": body})
        self.assertEqual(len(urls), 6)
        self.assertIn("https://api.adsb.lol/v2/point/33.6/58.4/250", urls, "260 NM capped at 250")
        self.assertEqual(status["state"], "ok")
        self.assertEqual(status["regions_ok"], 6)
        tehran = data["regions"][0]
        self.assertEqual((tehran["area"], tehran["radius_nm"], tehran["now_ms"]), ("tehran", 100, NOW_MS))
        self.assertEqual(tehran["ac"], [
            {"hex": "4b1803", "t": "A320", "flight": "THY7AB", "dbFlags": 0, "lat": 35.7123, "lon": 51.4},
            {"hex": "ae1234", "t": "C17", "dbFlags": 1},
        ])

    def test_one_failed_region_is_partial_and_named(self):
        ok = {"now": NOW_MS / 1000, "ac": []}
        data, status, _ = collect(collect_point, {"/26.5/56.4/": UpstreamError("HTTP 429"), "/v2/point/": ok})
        self.assertEqual(status["state"], "partial")
        self.assertEqual(status["detail"], "hormuz: HTTP 429")
        hormuz = next(r for r in data["regions"] if r["area"] == "hormuz")
        self.assertEqual(hormuz["error"], "HTTP 429")
        self.assertNotIn("ac", hormuz)

    def test_every_region_failing_is_error(self):
        _, status, _ = collect(collect_point, {"/v2/point/": UpstreamError("HTTP 403")})
        self.assertEqual(status["state"], "error")

    def test_stale_or_malformed_provider_answer_is_rejected(self):
        for body in ({"now": NOW_MS - 10 * 60_000, "ac": []}, {"ac": []}, {"now": NOW_MS}, ["x"]):
            with self.subTest(body=body):
                _, status, _ = collect(collect_point, {"/v2/point/": body})
                self.assertEqual(status["state"], "error")


class TestMil(unittest.TestCase):
    def test_adsb_lol_first(self):
        body = {"now": NOW_MS, "ac": [plane("ae0001", t="K35R", lat=29.1, lon=47.9, seen=1.25)]}
        data, status, urls = collect(collect_mil, {"adsb.lol/v2/mil": body})
        self.assertEqual(urls, ["https://api.adsb.lol/v2/mil"])
        self.assertEqual((status["state"], data["provider"], data["global_tagged_aircraft"]), ("ok", "adsb.lol", 1))
        self.assertEqual(data["ac"], [{"hex": "ae0001", "t": "K35R", "lat": 29.1, "lon": 47.9, "seen": 1.2}])

    def test_adsb_fi_fallback_records_the_failed_attempt(self):
        data, status, urls = collect(collect_mil, {
            "adsb.lol": UpstreamError("HTTP 429"), "adsb.fi": {"now": NOW_MS / 1000, "ac": []}})
        self.assertEqual([u.split("/")[2] for u in urls], ["api.adsb.lol", "opendata.adsb.fi"])
        self.assertEqual((status["state"], status["provider"]), ("ok", "adsb.fi"))
        self.assertEqual(status["detail"], "adsb.lol: HTTP 429")
        self.assertEqual(data["attempts"], [{"provider": "adsb.lol", "result": "HTTP 429"},
                                            {"provider": "adsb.fi", "result": "ok"}])

    def test_both_failing_is_error_without_aircraft(self):
        data, status, _ = collect(collect_mil, {"adsb": UpstreamError("HTTP 403")})
        self.assertEqual(status["state"], "error")
        self.assertEqual((data["provider"], data["ac"]), (None, []))


class TestMirrorContract(unittest.TestCase):
    def test_written_pairs_load_as_neon_mirror_snapshots(self):
        body = {"now": NOW_MS, "ac": [plane("ae0001")]}
        with TemporaryDirectory() as root:
            for kind, source, fn in (("point", "adsb", collect_point), ("mil", "adsb_mil", collect_mil)):
                data, status, _ = collect(fn, {"adsb": body})
                write_pair(kind, data, status, Path(root))
                snap = load_snapshot(source, root, now=NOW)
                self.assertEqual((snap.data, snap.status), (data, status))
                self.assertEqual(snap.checked_at, NOW)
            self.assertEqual(sorted(p.name for p in (Path(root) / "data").iterdir()),
                             sorted(n for pair in FILES.values() for n in pair))

    def test_trim_drops_unknown_fields_and_bad_values(self):
        out = trim_aircraft([{"hex": "abcdef", "t": "B-738", "lat": float("nan"), "dbFlags": True, "r": "EP-ABC"}])
        self.assertEqual(out, [{"hex": "abcdef"}])

    def test_regions_are_unique(self):
        names = [r[0] for r in load_config()["point"]["regions"]]
        self.assertEqual(len(names), len(set(names)))


if __name__ == "__main__":
    unittest.main()
