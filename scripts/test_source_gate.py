import unittest

from scripts.source_control import load_config
from scripts.source_gate import decide, source_for


class SourceGate(unittest.TestCase):
    def test_disabled_source_skips_scheduled_and_dispatched_main_runs(self):
        for event in ("schedule", "workflow_dispatch"):
            enabled, msg = decide(event, "refs/heads/main", lambda: "license review")
            self.assertFalse(enabled)
            self.assertIn("license review", msg)

    def test_enabled_source_collects(self):
        self.assertTrue(decide("schedule", "refs/heads/main", lambda: None)[0])

    def test_push_and_pr_runs_never_consult_d1(self):
        def boom():
            raise AssertionError("must not query")
        for event, ref in (("push", "refs/heads/main"), ("pull_request", "refs/pull/1/merge"),
                           ("schedule", "refs/heads/feature")):
            self.assertTrue(decide(event, ref, boom)[0])

    def test_lookup_failure_fails_open(self):
        def fail():
            raise RuntimeError("Cloudflare D1 SQL operation unsuccessful")
        enabled, msg = decide("schedule", "refs/heads/main", fail)
        self.assertTrue(enabled)
        self.assertIn("RuntimeError", msg)

    def test_only_mapped_collectors_are_gated(self):
        c = load_config()
        self.assertEqual(source_for("gdelt.yml", c), "gdelt_context")
        with self.assertRaises(ValueError):
            source_for("analysts.yml", c)


if __name__ == "__main__":
    unittest.main()
