import unittest
from datetime import datetime, timedelta, timezone

from verify_analyst_mirror import validate

NOW = datetime(2026, 11, 12, 11, 0, tzinfo=timezone.utc)


def sample():
    stamp = (NOW - timedelta(minutes=3)).isoformat().replace("+00:00", "Z")
    status = {"checked_at": stamp, "state": "partial", "sources": [
        {"source_id": "healthy-telegram", "state": "ok", "count": 1},
        {"source_id": "unavailable-youtube", "state": "error", "count": 0}
    ]}
    mirror = {"schema_version": 1, "checked_at": stamp, "items": [{
        "id": "healthy-telegram:42", "source_id": "healthy-telegram",
        "canonical_url": "https://t.me/public/42"}]}
    return mirror, status


class AnalystMirrorHealthTests(unittest.TestCase):
    def test_partial_healthy_sources_are_usable(self):
        mirror, status = sample()
        result = validate(mirror, status, NOW)
        self.assertEqual(result["mirror_state"], "partial")
        self.assertEqual(result["items"], 1)
        self.assertEqual(result["healthy_sources"], 1)

    def test_stale_mirror_is_rejected(self):
        mirror, status = sample()
        old = (NOW - timedelta(hours=6)).isoformat().replace("+00:00", "Z")
        mirror["checked_at"] = old
        status["checked_at"] = old
        with self.assertRaisesRegex(ValueError, "stale"):
            validate(mirror, status, NOW)

    def test_mismatched_timestamp_pair_is_rejected(self):
        mirror, status = sample()
        mirror["checked_at"] = (NOW - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        with self.assertRaisesRegex(ValueError, "diverge"):
            validate(mirror, status, NOW)

    def test_no_healthy_sources_is_rejected(self):
        mirror, status = sample()
        status["sources"][0]["state"] = "error"
        with self.assertRaisesRegex(ValueError, "no healthy"):
            validate(mirror, status, NOW)

    def test_error_source_items_are_never_published(self):
        mirror, status = sample()
        mirror["items"][0]["source_id"] = "unavailable-youtube"
        with self.assertRaisesRegex(ValueError, "errored"):
            validate(mirror, status, NOW)

    def test_duplicate_identifiers_are_rejected(self):
        mirror, status = sample()
        mirror["items"].append(dict(mirror["items"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate(mirror, status, NOW)

    def test_oversized_mirror_is_rejected(self):
        mirror, status = sample()
        mirror["items"] = [dict(mirror["items"][0],
                               id=f"healthy-telegram:{i}") for i in range(41)]
        with self.assertRaisesRegex(ValueError, "exceeds"):
            validate(mirror, status, NOW)

    def test_empty_mirror_with_healthy_sources_allowed(self):
        mirror, status = sample()
        mirror["items"] = []
        self.assertEqual(validate(mirror, status, NOW)["items"], 0)


if __name__ == "__main__":
    unittest.main()
