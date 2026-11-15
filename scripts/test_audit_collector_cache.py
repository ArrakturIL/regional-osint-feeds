"""Offline regression tests for READ-ONLY comparison of GitHub collector JSON against D1.

Tests never connect to Cloudflare or Neon and never write to a real database.
"""
from __future__ import annotations
import contextlib
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import io
import json
import unittest

from scripts.neon_mirror import canonical_hash
from scripts.audit_collector_cache import compare_source, main

STAMP = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)
DATA = {"source": "gdelt_context", "sample": [], "count": 3}


def iso(value):
    return value.isoformat().replace("+00:00", "Z")


def status(value=STAMP, state="partial"):
    return {"source": "gdelt_context", "state": state, "checked_at": iso(value)}


def row(data=DATA, state=None, at=STAMP):
    state = state or status(at)
    return {
        "source_key": "gdelt",
        "checked_at_ms": int(at.timestamp() * 1000),
        "data_json": json.dumps(data, ensure_ascii=False),
        "status_json": json.dumps(state, ensure_ascii=False),
        "data_sha256": canonical_hash(data),
        "status_sha256": canonical_hash(state),
    }


class TestReadOnlyParity(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name) / "data"
        root.mkdir()
        self.root = root.parent
        self.original_status = status()
        (root / "gdelt-context.json").write_text(json.dumps(DATA), encoding="utf8")
        (root / "gdelt-status.json").write_text(json.dumps(self.original_status), encoding="utf8")

    def test_matching_pairs_pass_and_preserve_partial_state(self):
        verdict = compare_source("gdelt", self.root, row(), now=STAMP + timedelta(minutes=2))
        self.assertEqual(verdict["comparison"], "matched")
        self.assertEqual(verdict["github_state"], "partial")
        self.assertEqual(verdict["cache_state"], "partial")
        self.assertEqual(verdict["lag_seconds"], 0)

    def test_older_cache_is_detected_not_marked_synced(self):
        previous = STAMP - timedelta(hours=4)
        verdict = compare_source("gdelt", self.root, row(at=previous), now=STAMP + timedelta(minutes=2))
        self.assertEqual(verdict["comparison"], "cache_behind")
        self.assertEqual(verdict["lag_seconds"], 4 * 3600)

    def test_newer_cache_is_distinguished_from_lagging_cache(self):
        newer = STAMP + timedelta(minutes=10)
        verdict = compare_source("gdelt", self.root, row(at=newer), now=STAMP + timedelta(minutes=12))
        self.assertEqual(verdict["comparison"], "cache_ahead")
        self.assertEqual(verdict["lag_seconds"], -10 * 60)

    def test_equal_timestamp_different_data_is_a_conflict(self):
        changed = row(data={**DATA, "count": 42})
        verdict = compare_source("gdelt", self.root, changed, now=STAMP + timedelta(minutes=2))
        self.assertEqual(verdict["comparison"], "equal_time_conflict")
        self.assertNotEqual(verdict["comparison"], "matched")

    def test_corrupt_d1_digest_fails_closed_and_leaves_source_unpublished(self):
        damaged = row()
        damaged["data_sha256"] = "0" * 64
        verdict = compare_source("gdelt", self.root, damaged, now=STAMP + timedelta(minutes=2))
        self.assertEqual(verdict["comparison"], "invalid_cache")

    def test_missing_cache_does_not_look_like_success(self):
        verdict = compare_source("gdelt", self.root, None, now=STAMP + timedelta(minutes=2))
        self.assertEqual(verdict["comparison"], "missing_cache")

    def test_invalid_status_state_is_not_accepted_as_verified(self):
        bad = row(state=status(state="verified"))
        verdict = compare_source("gdelt", self.root, bad, now=STAMP + timedelta(minutes=2))
        self.assertEqual(verdict["comparison"], "invalid_cache")

    def test_no_token_returns_no_access_error_without_leaking_values(self):
        with patch.dict("os.environ", {}, clear=True), contextlib.redirect_stderr(io.StringIO()) as err:
            code = main(["--root", str(self.root)])
        self.assertEqual(code, 2)
        self.assertNotIn("Bearer", err.getvalue())

if __name__ == "__main__":
    unittest.main()
