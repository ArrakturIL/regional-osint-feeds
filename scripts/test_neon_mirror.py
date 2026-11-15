import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scripts.neon_mirror import (
    SOURCE_FILES, MAX_DOC_BYTES, load_snapshot, decide_update,
    canonical_hash, UPSERT_SQL, inspect_snapshot,
)

NOW = datetime.now(timezone.utc).replace(microsecond=0)


class TestCollectorSnapshotContract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.joinpath("data").mkdir()

    def write_pair(self, source="gdelt"):
        data_file, status_file = SOURCE_FILES[source]
        payload = {"source": "gdelt_context", "batches": [], "sample": [{"id": "123"}]}
        status = {"checked_at": NOW.isoformat().replace("+00:00", "Z"), "state": "ok"}
        (self.root / "data" / data_file).write_text(json.dumps(payload), encoding="utf8")
        (self.root / "data" / status_file).write_text(json.dumps(status), encoding="utf8")
        return payload, status

    def test_registry_contains_collector_mirrors_and_translation(self):
        self.assertEqual(set(SOURCE_FILES), {
            "analysts", "centcom", "copernicus", "gdelt",
            "marad", "satellite", "unosat", "news_translation",
        })

    def test_load_paired_json_is_atomic_and_preserves_original_objects(self):
        payload, status = self.write_pair()
        snapshot = load_snapshot("gdelt", self.root, now=NOW)
        self.assertEqual(snapshot.data, payload)
        self.assertEqual(snapshot.status, status)
        self.assertEqual(snapshot.checked_at, NOW)
        self.assertEqual(snapshot.source_key, "gdelt")
        self.assertEqual(snapshot.data_sha256, canonical_hash(payload))
        self.assertEqual(snapshot.status_sha256, canonical_hash(status))

    def test_unknown_source_and_missing_status_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "unknown collector"):
            load_snapshot("../../secrets", self.root, now=NOW)
        self.write_pair()
        (self.root / "data" / SOURCE_FILES["gdelt"][1]).unlink()
        with self.assertRaisesRegex(ValueError, "missing"):
            load_snapshot("gdelt", self.root, now=NOW)

    def test_invalid_and_oversize_json_fail_without_partial_snapshot(self):
        self.write_pair()
        data = self.root / "data" / SOURCE_FILES["gdelt"][0]
        data.write_text("not-json", encoding="utf8")
        with self.assertRaisesRegex(ValueError, "invalid JSON"):
            load_snapshot("gdelt", self.root, now=NOW)
        data.write_text('{"content":"' + ("x" * MAX_DOC_BYTES) + '"}', encoding="utf8")
        with self.assertRaisesRegex(ValueError, "exceeds cap"):
            load_snapshot("gdelt", self.root, now=NOW)

    def test_future_checked_at_and_missing_status_fields_fail(self):
        self.write_pair()
        f = self.root / "data" / SOURCE_FILES["gdelt"][1]
        f.write_text(json.dumps({"state": "ok", "checked_at": (NOW + timedelta(hours=2)).isoformat()}))
        with self.assertRaisesRegex(ValueError, "future"):
            load_snapshot("gdelt", self.root, now=NOW)
        f.write_text(json.dumps({"state": "ok"}))
        with self.assertRaisesRegex(ValueError, "checked_at"):
            load_snapshot("gdelt", self.root, now=NOW)

    def test_non_ok_status_is_stored_as_a_status_not_false_clean_data(self):
        self.write_pair()
        f = self.root / "data" / SOURCE_FILES["gdelt"][1]
        f.write_text(json.dumps({"state": "partial", "checked_at": NOW.isoformat()}))
        snapshot = load_snapshot("gdelt", self.root, now=NOW)
        self.assertEqual(snapshot.status["state"], "partial")

    def test_news_translation_mirror_has_synthetic_status(self):
        data_file, status_file = SOURCE_FILES["news_translation"]
        self.assertIsNone(status_file)
        file = self.root / "data" / data_file
        file.write_text(json.dumps({"generated_at": NOW.isoformat(), "items": []}))
        snapshot = load_snapshot("news_translation", self.root, now=NOW)
        self.assertEqual(snapshot.status["state"], "ok")
        self.assertEqual(snapshot.checked_at, NOW)

    def test_canonical_hash_ignores_json_key_order_but_not_value_changes(self):
        self.assertEqual(canonical_hash({"a": 1, "b": 2}), canonical_hash({"b": 2, "a": 1}))
        self.assertNotEqual(canonical_hash({"a": 1}), canonical_hash({"a": 2}))

    def test_monotonic_writer_rejects_older_and_equal_conflicting_data(self):
        same = NOW
        newer = NOW + timedelta(seconds=10)
        older = NOW - timedelta(seconds=10)
        self.assertEqual(decide_update(None, None, None, same, "a", "b"), "written")
        self.assertEqual(decide_update(same, "a", "b", newer, "c", "d"), "written")
        self.assertEqual(decide_update(same, "a", "b", older, "c", "d"), "stale")
        self.assertEqual(decide_update(same, "a", "b", same, "a", "b"), "unchanged")
        self.assertEqual(decide_update(same, "a", "b", same, "different", "b"), "conflict")

    def test_sql_is_atomic_and_binds_values_instead_of_interpolating(self):
        self.assertIn("ON CONFLICT", UPSERT_SQL)
        self.assertIn("EXCLUDED.checked_at >", UPSERT_SQL)
        self.assertIn("RETURNING source_key", UPSERT_SQL)
        self.assertGreaterEqual(UPSERT_SQL.count("%s"), 6)

    def test_inspect_snapshot_reports_match_or_mismatch(self):
        self.write_pair()
        snap = load_snapshot("gdelt", self.root, now=NOW)
        self.assertTrue(inspect_snapshot(snap, {
            "source_key": "gdelt", "checked_at": NOW,
            "data_sha256": snap.data_sha256, "status_sha256": snap.status_sha256,
        })["match"])
        self.assertFalse(inspect_snapshot(snap, {
            "source_key": "gdelt", "checked_at": NOW,
            "data_sha256": "0" * 64, "status_sha256": snap.status_sha256,
        })["match"])



class TestWorkflowShadowSafety(unittest.TestCase):
    def test_gdelt_collector_adds_neon_shadow_without_removing_git_fallback(self):
        workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/gdelt.yml").read_text(encoding="utf8")
        self.assertIn("branches: [main]", workflow)
        self.assertIn("python -m scripts.publish_neon_mirror --source gdelt --mode shadow", workflow)
        self.assertIn("NEON_DATABASE_URL:", workflow)
        self.assertIn("secrets.NEON_DATABASE_URL", workflow)
        self.assertIn("Commit only small bounded news-context metadata", workflow)
        self.assertIn("git push", workflow)
        self.assertIn("github.ref == 'refs/heads/main'", workflow)

if __name__ == "__main__":
    unittest.main()
