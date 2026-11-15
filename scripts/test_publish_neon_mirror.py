"""Offline regression tests for the optional Neon mirror publisher."""
import contextlib
import io
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from scripts.publish_neon_mirror import publish_one, main


class FakeCursor:
    def __init__(self, row):
        self.row = row
    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self, stored=None):
        self.stored = stored
        self.statements = []
    def __enter__(self):
        return self
    def __exit__(self, typ, val, tb):
        return False
    def execute(self, statement, parameters):
        self.statements.append((statement, parameters))
        if "INSERT" in statement and self.stored is None:
            self.stored = (parameters[0], parameters[-1], parameters[3], parameters[4])
            self.data_payload = json.loads(parameters[1])
            self.status_payload = json.loads(parameters[2])
            return FakeCursor(self.stored)
        if "data_payload" in statement and "SELECT" in statement and self.stored:
            return FakeCursor((*self.stored,self.data_payload,self.status_payload))
        return FakeCursor(self.stored)


NOW = datetime(2026, 11, 15, 3, 10, tzinfo=timezone.utc)


class TestPublisher(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        data = self.root / "data"
        data.mkdir()
        (data / "gdelt-context.json").write_text(json.dumps({"source": "gdelt_context", "sample": []}))
        (data / "gdelt-status.json").write_text(json.dumps({"source": "gdelt_context", "state": "ok", "checked_at": "2026-11-15T03:10:00Z"}))

    def test_shadow_write_is_one_atomic_pair_with_no_sensitive_logging(self):
        fake = FakeConnection()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = publish_one("gdelt", self.root, "postgresql://hidden-secret",
                                 connector=lambda url: fake, now=NOW)
        self.assertEqual(result["result"], "written")
        self.assertEqual(len(fake.statements), 2)
        self.assertIn("INSERT INTO", fake.statements[0][0])
        self.assertNotIn("hidden-secret", output.getvalue())
        self.assertIn("gdelt", output.getvalue())
        self.assertNotIn("gdelt_context", output.getvalue())

    def test_unknown_source_rejected_before_any_connection(self):
        with self.assertRaisesRegex(ValueError, "unknown collector"):
            publish_one("../env", self.root, "postgresql://secret",
                        connector=lambda url: self.fail("connect must not happen"), now=NOW)

    def test_missing_secret_cli_skips_explicitly_without_exception(self):
        output = io.StringIO()
        with patch.dict(os.environ, {}, clear=True), contextlib.redirect_stdout(output):
            code = main(["--source", "gdelt", "--root", str(self.root), "--mode", "shadow"])
        self.assertEqual(code, 0)
        self.assertIn("missing_secret", output.getvalue())

    def test_strict_mode_refuses_missing_secret(self):
        with patch.dict(os.environ, {}, clear=True), contextlib.redirect_stdout(io.StringIO()):
            code = main(["--source", "gdelt", "--root", str(self.root), "--mode", "required"])
        self.assertEqual(code, 2)

    def test_connection_failure_does_not_print_password(self):
        url = "postgresql://user:VERY_SENSITIVE_TOKEN@db.example/neondb"
        output = io.StringIO()
        errors = io.StringIO()
        with patch.dict(os.environ, {"NEON_DATABASE_URL": url}):
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                with patch("scripts.publish_neon_mirror._open_connection", side_effect=RuntimeError(url)):
                    result = main(["--source", "gdelt", "--root", str(self.root), "--mode", "shadow"])
        self.assertEqual(result, 0)
        self.assertNotIn("VERY_SENSITIVE_TOKEN", output.getvalue() + errors.getvalue())
        self.assertIn("mirror_write_error", errors.getvalue())


    def test_equal_timestamp_conflicting_pair_fails_closed(self):
        # A concurrent collector with the same checked_at but different hashes
        # is an integrity collision, not a successful or stale mirror.
        class ConflictConnection:
            def __enter__(self): return self
            def __exit__(self, typ, val, tb): return False
            def execute(self, sql, params):
                if "INSERT" in sql:
                    return FakeCursor(None)
                return FakeCursor(("gdelt", NOW, "0" * 64, "1" * 64))

        with contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, "conflict"):
                publish_one("gdelt", self.root, "postgresql://hidden",
                            connector=lambda _: ConflictConnection(), now=NOW)

    def test_required_mode_reports_connection_failure(self):
        with patch.dict(os.environ, {"NEON_DATABASE_URL": "postgresql://secret"}):
            with patch("scripts.publish_neon_mirror._open_connection", side_effect=OSError("connection refused")):
                with contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(main(["--source", "gdelt", "--root", str(self.root), "--mode", "required"]), 1)


if __name__ == "__main__":
    unittest.main()
