import io
import json
import tempfile
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from scripts import collect_airlabs as a


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *x):
        return False


def flight(airline, status="scheduled", delayed=0, cs=None):
    return {"airline_iata": airline, "status": status, "dep_delayed": delayed, "cs_flight_iata": cs}


class Opener:
    def __init__(self, answer):
        self.answer = answer
        self.codes = []

    def __call__(self, req, timeout=None):
        code = req.full_url.split("dep_iata=")[1].split("&")[0]
        self.codes.append(code)
        ans = self.answer(code) if callable(self.answer) else self.answer
        if isinstance(ans, int):
            raise urllib.error.HTTPError("x", ans, "x", {}, None)
        return Resp(json.dumps(ans).encode())


class AirLabsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.p = [mock.patch.object(a, "DATA", d), mock.patch.object(a, "SNAP", d / "s.json"),
                  mock.patch.object(a, "STATUS", d / "st.json")]
        for p in self.p:
            p.start()
        self.now = datetime(2026, 11, 23, 0, 0, tzinfo=timezone.utc)

    def tearDown(self):
        for p in self.p:
            p.stop()
        self.tmp.cleanup()

    def test_summarize_skips_codeshares_and_splits_foreign(self):
        s = a.summarize([flight("LY"), flight("LY", cs="AA1"), flight("LH", "cancelled"), flight("LY", "cancelled"),
                         flight("W6", delayed=40), flight("W6", delayed=5)], {"LY", "IZ", "6H"})
        self.assertEqual((s["flights"], s["cancelled"], s["foreign_cancelled"], s["delayed"], s["avg_delay"]), (5, 2, 1, 1, 40))
        self.assertEqual(s["cancelled_by"], {"LH": 1, "LY": 1})

    def test_first_run_fetches_all_airports_and_never_stores_key(self):
        op = Opener({"response": [flight("LY")]})
        self.assertEqual(a.collect("SECRETKEY", op, self.now), 0)
        self.assertEqual(sorted(op.codes), sorted(a.AIRPORTS))
        text = a.SNAP.read_text() + a.STATUS.read_text()
        self.assertNotIn("SECRETKEY", text)
        st = json.loads(a.STATUS.read_text())
        self.assertEqual((st["state"], st["used_day"], st["used_month"]), ("ok", 12, 12))

    def test_only_due_airports_next_hour_then_tlv_after_three(self):
        op = Opener({"response": []})
        a.collect("k", op, self.now)
        op.codes.clear()
        a.collect("k", op, self.now + timedelta(hours=1))
        self.assertEqual(op.codes, [])
        a.collect("k", op, self.now + timedelta(hours=3))
        self.assertEqual(op.codes, ["TLV"])

    def test_daily_plan_fits_budget(self):
        per_day = sum(24 // hours for hours, _ in a.AIRPORTS.values())
        self.assertLessEqual(per_day, a.DAILY_BUDGET)
        self.assertLessEqual(per_day * 31, a.MONTHLY_BUDGET)

    def test_key_expiry_and_limit_are_kept_in_status(self):
        body = {"request": {"key": {"type": "free", "expired": "2026-12-11T00:00:00.000Z", "limits_by_month": 1000, "api_key": "SECRET"}},
                "response": []}
        a.collect("k", Opener(body), self.now)
        st = json.loads(a.STATUS.read_text())
        self.assertEqual((st["key_expires"], st["limit_month"], st["key_type"]), ("2026-12-11", 1000, "free"))
        self.assertNotIn("SECRET", a.STATUS.read_text())

    def test_limit_error_stops_run_and_keeps_counts(self):
        op = Opener({"error": {"code": "month_limit_exceeded", "message": "x"}})
        self.assertEqual(a.collect("k", op, self.now), 1)
        self.assertEqual(len(op.codes), 1)
        self.assertEqual(json.loads(a.STATUS.read_text())["detail"], "month_limit_exceeded")

    def test_monthly_budget_respected(self):
        a.STATUS.write_text(json.dumps({"day": "2026-11-23", "used_day": 0, "month": "2026-11", "used_month": 949}))
        op = Opener({"response": []})
        a.collect("k", op, self.now)
        self.assertEqual(len(op.codes), 1)
        self.assertEqual(json.loads(a.STATUS.read_text())["state"], "partial")

    def test_one_airport_failing_does_not_stop_others(self):
        op = Opener(lambda c: 500 if c == "DAM" else {"response": []})
        self.assertEqual(a.collect("k", op, self.now), 0)
        st = json.loads(a.STATUS.read_text())
        self.assertEqual(st["state"], "partial")
        self.assertEqual(len(st["fetched"]), 11)

    def test_history_trimmed_to_window(self):
        old = (self.now - timedelta(days=20)).isoformat().replace("+00:00", "Z")
        a.SNAP.write_text(json.dumps({"airports": {"TLV": {"checked_at": old, "history": [[old, 1, 0, 0, 0]]}}}))
        a.collect("k", Opener({"response": []}), self.now)
        self.assertEqual(len(json.loads(a.SNAP.read_text())["airports"]["TLV"]["history"]), 1)


if __name__ == "__main__":
    unittest.main()
