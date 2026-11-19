import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scripts.neon_mirror import (
    GITHUB_JSON_SOURCES, SOURCE_FILES, MAX_DOC_BYTES, load_snapshot, decide_update,
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
            "marad", "satellite", "unosat", "news_translation", "adsb", "adsb_mil",
        })
        # Q12: ADS-B JSON is never committed; jobs that compare GitHub JSON skip it.
        self.assertEqual(set(SOURCE_FILES) - set(GITHUB_JSON_SOURCES), {"adsb", "adsb_mil"})

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


    def test_canonical_hash_normalizes_integral_json_floats_from_satellite_data(self):
        # GitHub backfill was serialized by JavaScript, where 47.0 becomes 47.
        # Python preserves 47.0 unless explicitly normalized. Both represent
        # the same JSON number; hash parity must be language independent here.
        left = {"bbox": [47.0, 22.0, 57.5, -0.0], "valid": True}
        right = {"bbox": [47, 22, 57.5, 0], "valid": True}
        self.assertEqual(canonical_hash(left), canonical_hash(right))

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


    def test_all_scheduled_collector_workflows_shadow_without_removing_git_fallback(self):
        cases = {
            "analysts": ("analysts.yml", "Commit bounded mirror and source heartbeat"),
            "centcom": ("centcom-test.yml", "Commit updated news or status heartbeat"),
            "copernicus": ("copernicus-analytics.yml", "Commit public metadata mirror"),
            "marad": ("marad.yml", "Publish changed official advisories"),
            "satellite": ("satellite.yml", "Commit only metadata"),
            "unosat": ("unosat-analyses.yml", "Commit public-only metadata"),
            "news_translation": ("news-open-source-translation.yml", "Publish bounded validated translation mirror"),
        }
        workflows = Path(__file__).resolve().parents[1] / ".github/workflows"
        for source, (file_name, fallback) in cases.items():
            with self.subTest(source=source):
                content = (workflows / file_name).read_text(encoding="utf8")
                self.assertIn("python -m scripts.publish_neon_mirror --source " + source + " --mode shadow", content)
                self.assertIn("secrets.NEON_DATABASE_URL", content)
                self.assertIn("github.ref == 'refs/heads/main'", content)
                self.assertIn(fallback, content)
                self.assertIn("git ", content)


class TestStoredSnapshotIntegrity(unittest.TestCase):
    """A matching DB digest column alone must never certify actual JSONB bytes."""
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name)
        (root/"data").mkdir()
        (root/"data"/"gdelt-context.json").write_text(json.dumps({"source":"gdelt_context","sample":[1]}),encoding="utf8")
        (root/"data"/"gdelt-status.json").write_text(json.dumps({"checked_at":NOW.isoformat(),"state":"ok"}),encoding="utf8")
        self.snapshot=load_snapshot("gdelt",root,now=NOW)

    def stored_row(self):
        s=self.snapshot
        return (s.source_key,s.checked_at,s.data_sha256,s.status_sha256,s.data,s.status)

    def test_readback_returns_exact_validated_pair(self):
        from scripts.neon_mirror import validate_stored_row
        s=validate_stored_row(self.stored_row())
        self.assertEqual(s.data,self.snapshot.data)
        self.assertEqual(s.status,self.snapshot.status)
        self.assertEqual(s.checked_at,self.snapshot.checked_at)

    def test_readback_rejects_payload_changed_without_digest_update(self):
        from scripts.neon_mirror import validate_stored_row
        row=list(self.stored_row())
        row[4]={"source":"gdelt_context","sample":["tampered"]}
        with self.assertRaisesRegex(ValueError,"digest"):
            validate_stored_row(tuple(row))

    def test_readback_rejects_status_checked_at_inconsistent_with_db_column(self):
        from scripts.neon_mirror import validate_stored_row
        row=list(self.stored_row())
        row[1]=NOW+timedelta(hours=2)
        with self.assertRaisesRegex(ValueError,"timestamp"):
            validate_stored_row(tuple(row))

    def test_actual_parity_check_reads_and_verifies_jsonb_not_only_stored_digests(self):
        from scripts.neon_mirror import verify_snapshot
        row=list(self.stored_row())
        row[4]={"source":"gdelt_context","sample":["corrupted"]}
        class Conn:
            def execute(self,sql,args):
                self.sql=sql
                class Cursor:
                    def fetchone(self): return tuple(row)
                return Cursor()
        db=Conn()
        with self.assertRaisesRegex(ValueError,"digest"):
            verify_snapshot(db,self.snapshot)
        self.assertIn("data_payload",db.sql)


    def test_read_stored_snapshot_rejects_invalid_key_before_db_and_reads_full_pair(self):
        from scripts.neon_mirror import read_stored_snapshot
        outer=self
        class FakeDB:
            called=False
            def execute(self,sql,args):
                self.called=True
                self.sql=sql
                self.args=args
                class Cur:
                    def fetchone(self):
                        return outer.stored_row()
                return Cur()
        db=FakeDB()
        with self.assertRaisesRegex(ValueError,"unknown collector"):
            read_stored_snapshot(db,"../../secret")
        self.assertFalse(db.called)
        row=read_stored_snapshot(db,"gdelt")
        self.assertTrue(db.called)
        self.assertIn("data_payload",db.sql)
        self.assertEqual(db.args,("gdelt",))
        self.assertEqual(row.data,self.snapshot.data)

    def test_read_stored_snapshot_missing_returns_none_not_empty_data(self):
        from scripts.neon_mirror import read_stored_snapshot
        class FakeDB:
            def execute(self,sql,args):
                class Cur:
                    def fetchone(self):return None
                return Cur()
        self.assertIsNone(read_stored_snapshot(FakeDB(),"gdelt"))

    def test_readback_rejects_oversized_json_after_db_decode(self):
        from scripts.neon_mirror import validate_stored_row
        row=list(self.stored_row())
        row[4]={"excess":"x"*(MAX_DOC_BYTES+1)}
        with self.assertRaisesRegex(ValueError,"cap"):
            validate_stored_row(tuple(row))


if __name__ == "__main__":
    unittest.main()
