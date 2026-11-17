"""ARCH-05: realistic GDELT export-gap and backlog regression (offline)."""
import contextlib
import hashlib
import json
import tempfile
import os
from pathlib import Path
import io
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from scripts import collect_gdelt as gdelt


NOW = datetime(2026, 11, 17, 0, 0, tzinfo=timezone.utc)
ZIP_CONTENT = b"test-export-payload"


def stamp(hour, minute):
    return f"20261116{hour:02d}{minute:02d}00"


def run_collector(previous_batch, latest_batch, failures=()):
    seen, emitted = [], []

    def request(url, *, limit):
        if url.endswith("/lastupdate.txt"):
            return (f"{len(ZIP_CONTENT)} {hashlib.md5(ZIP_CONTENT).hexdigest()} "
                    f"https://data.gdeltproject.org/gdeltv2/{latest_batch}.export.CSV.zip").encode()
        s = url.rsplit("/", 1)[1].split(".", 1)[0]
        seen.append(s)
        if s in failures:
            raise ValueError("simulated upstream archive unavailable")
        return ZIP_CONTENT

    def parse_export(payload, s):
        assert payload == ZIP_CONTENT
        return 1, [{
            "id": s, "action_country": "IR", "root_code": "18",
            "domain": "example.org", "reported_sources": 2,
            "reported_articles": 3,
        }]

    with patch.object(gdelt, "utcnow", return_value=NOW), \
         patch.object(gdelt, "load_previous", return_value={
             "source": "gdelt_context", "latest_batch": previous_batch
         }), \
         patch.object(gdelt, "request", side_effect=request), \
         patch.object(gdelt, "parse_export", side_effect=parse_export), \
         patch.object(gdelt, "emit", side_effect=lambda *args: emitted.append(args)), \
         contextlib.redirect_stdout(io.StringIO()):
        code = gdelt.collect()
    return code, seen, emitted[-1]


class GdeltWatermarkSafety(unittest.TestCase):
    def test_failed_middle_export_does_not_advance_past_gap(self):
        previous = stamp(22, 30)
        lost = stamp(23, 0)
        code, seen, result = run_collector(previous, stamp(23, 15), {lost})
        self.assertEqual(code, 0, "partial export data can remain available")
        self.assertEqual(seen, [stamp(22, 45), lost, stamp(23, 15)])
        self.assertEqual(result[1], "partial")
        self.assertEqual(result[4]["latest_batch"], stamp(22, 45),
                         "next cron must retry the missing 23:00 export")
        self.assertEqual(result[4]["batches"], [stamp(22, 45), stamp(23, 15)])

    def test_backlog_over_eight_batches_fetches_oldest_pending_first(self):
        previous = stamp(20, 0)
        code, seen, result = run_collector(previous, stamp(23, 45))
        self.assertEqual(code, 0)
        self.assertEqual(seen, [
            stamp(20, 15), stamp(20, 30), stamp(20, 45), stamp(21, 0),
            stamp(21, 15), stamp(21, 30), stamp(21, 45), stamp(22, 0),
        ], "hourly quota must drain backlog chronologically, never leapfrog older archives")
        self.assertEqual(result[1], "partial")
        self.assertEqual(result[4]["latest_batch"], stamp(22, 0))
        self.assertEqual(result[4]["batch_count"], 8)

    def test_latest_export_failure_retries_it_after_earlier_successes(self):
        code, seen, result = run_collector(stamp(22, 30), stamp(23, 15), {stamp(23, 15)})
        self.assertEqual(code, 0)
        self.assertEqual(seen, [stamp(22, 45), stamp(23, 0), stamp(23, 15)])
        self.assertEqual(result[4]["latest_batch"], stamp(23, 0))
        self.assertEqual(result[1], "partial")

    def test_successful_short_window_reaches_latest_without_spurious_partial(self):
        code, seen, result = run_collector(stamp(22, 30), stamp(23, 15))
        self.assertEqual(code, 0)
        self.assertEqual(seen, [stamp(22, 45), stamp(23, 0), stamp(23, 15)])
        self.assertEqual(result[4]["latest_batch"], stamp(23, 15))
        self.assertEqual(result[1], "ok")


    def test_neon_primary_checkpoint_advances_beyond_old_git_fallback(self):
        with tempfile.TemporaryDirectory() as temp:
            git_file = Path(temp) / "gdelt-context.json"
            git_file.write_text(json.dumps({"source": "gdelt_context",
                                             "latest_batch": "20261115174500"}))
            with patch.object(gdelt, "SNAP", git_file), \
                 patch.dict(os.environ, {"NEON_DATABASE_URL": "postgresql://private-neon"}, clear=True), \
                 patch.object(gdelt, "_load_neon_checkpoint", create=True,
                              return_value={"source": "gdelt_context",
                                            "latest_batch": "20261115194500"}):
                self.assertEqual(gdelt.load_previous()["latest_batch"], "20261115194500",
                                 "Neon-primary must not start each hourly catch-up from stale GitHub JSON")

    def test_neon_checkpoint_failure_does_not_silently_fall_back_to_stale_github(self):
        with tempfile.TemporaryDirectory() as temp:
            git_file = Path(temp) / "gdelt-context.json"
            git_file.write_text(json.dumps({"source": "gdelt_context",
                                             "latest_batch": "20261115174500"}))
            with patch.object(gdelt, "SNAP", git_file), \
                 patch.dict(os.environ, {"NEON_DATABASE_URL": "postgresql://private-neon"}, clear=True), \
                 patch.object(gdelt, "_load_neon_checkpoint", create=True,
                              side_effect=OSError("postgresql://sensitive-password")):
                with self.assertRaisesRegex(RuntimeError, "Neon checkpoint unavailable") as error:
                    gdelt.load_previous()
                self.assertNotIn("sensitive-password", str(error.exception))

    def test_newer_github_checkpoint_preserved_if_neon_snapshot_is_older(self):
        with tempfile.TemporaryDirectory() as temp:
            git_file = Path(temp) / "gdelt-context.json"
            git_file.write_text(json.dumps({"source": "gdelt_context",
                                             "latest_batch": "20261116194500"}))
            with patch.object(gdelt, "SNAP", git_file), \
                 patch.dict(os.environ, {"NEON_DATABASE_URL": "postgresql://private-neon"}, clear=True), \
                 patch.object(gdelt, "_load_neon_checkpoint", create=True,
                              return_value={"source": "gdelt_context",
                                            "latest_batch": "20261115194500"}):
                self.assertEqual(gdelt.load_previous()["latest_batch"], "20261116194500")



if __name__ == "__main__":
    unittest.main()
