"""Regression: successful NASA checks must refresh collector status even without new imagery.

The real satellite main() and save_if_changed() write temporary JSON files;
only NASA network collection and the wall clock are substituted.
"""
import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from scripts import collect_satellite as satellite
from scripts.neon_mirror import load_snapshot

FIRST = datetime(2026, 11, 16, 9, 0, tzinfo=timezone.utc)
SECOND = datetime(2026, 11, 17, 9, 0, tzinfo=timezone.utc)


def same_observation():
    return {
        "source": "satellite_context",
        "providers": ["NASA GIBS", "NASA EONET"],
        "layer": "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
        "latest_requested_date": "2026-11-14",
        "earlier_requested_date": "2026-11-11",
        "visual_overviews": [{"region": "strait_of_hormuz",
                              "quicklooks": [], "imagery_coverage": "partial"}],
        "natural_events": [],
        "quality": {
            "has_optical_quicklooks": True,
            "has_eonet_response": True,
            "issues": [],
            "image_change_is_not_evidence_of_conflict": True,
            "not_an_alert_source": True,
        },
    }


class SatelliteHeartbeatSafety(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        (self.root / "data").mkdir()
        self.data = self.root / "data" / "satellite-observations.json"
        self.status = self.root / "data" / "satellite-status.json"

    def run_successful_scan(self, at):
        with patch.object(satellite, "DATA_PATH", self.data), \
             patch.object(satellite, "STATUS_PATH", self.status), \
             patch.object(satellite, "now_utc", return_value=at), \
             patch.object(satellite, "collect", side_effect=lambda when: same_observation()), \
             contextlib.redirect_stdout(io.StringIO()):
            return satellite.main()

    def test_unchanged_satellite_content_still_refreshes_verified_status_in_neon_snapshot(self):
        self.assertEqual(self.run_successful_scan(FIRST), 0)
        first_data = self.data.read_bytes()
        first_status = json.loads(self.status.read_text())
        self.assertEqual(first_status["checked_at"], "2026-11-16T09:00:00Z")

        self.assertEqual(self.run_successful_scan(SECOND), 0)
        second_status = json.loads(self.status.read_text())
        self.assertEqual(second_status["checked_at"], "2026-11-17T09:00:00Z",
                         "successful second daily poll must not be marked stale")
        self.assertEqual(second_status["snapshot_changed"], False)
        self.assertEqual(self.data.read_bytes(), first_data,
                         "unchanged satellite metadata must not be rewritten")
        stored = load_snapshot("satellite", self.root, now=SECOND)
        self.assertEqual(stored.checked_at, SECOND)
        self.assertEqual(stored.status["state"], "ok")

    def test_same_timestamp_without_changes_does_not_rewrite_status(self):
        self.assertEqual(self.run_successful_scan(FIRST), 0)
        before = self.status.read_bytes()
        self.assertEqual(self.run_successful_scan(FIRST), 0)
        self.assertEqual(self.status.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
