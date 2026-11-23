import io
import json
import unittest
from datetime import date

from scripts.usage_report import actions_metrics, cloudflare_metrics, evaluate, fetch_runs, markdown

ACCOUNT = {
    "workers": [
        {"dimensions": {"scriptName": "regional-watch-editor"}, "sum": {"requests": 528, "errors": 0, "cpuTimeUs": 2_000_000},
         "quantiles": {"cpuTimeP99": 1_109_532}},
        {"dimensions": {"scriptName": "regional-osint-monitor"}, "sum": {"requests": 1459, "errors": 1, "cpuTimeUs": 500_000},
         "quantiles": {"cpuTimeP99": 20_301}},
    ],
    "d1": [{"dimensions": {"databaseId": "a"}, "sum": {"rowsRead": 1_307_277, "rowsWritten": 7755}},
           {"dimensions": {"databaseId": "b"}, "sum": {"rowsRead": 1_133_696, "rowsWritten": 4387}}],
    "ai": [{"dimensions": {"modelId": "glm"}, "count": 145, "sum": {"totalNeurons": 1708.34}},
           {"dimensions": {"modelId": "llama"}, "count": 45, "sum": {"totalNeurons": 7000.0}}],
}
BUDGETS = json.load(open("config/usage-budgets.json"))


class UsageReport(unittest.TestCase):
    def test_cloudflare_totals_from_graphql(self):
        m = {r["metric"]: r for r in cloudflare_metrics(ACCOUNT)}
        self.assertEqual(m["workers_requests"]["value"], 1987)
        self.assertEqual(m["workers_cpu_ms"]["value"], 2500.0)
        self.assertEqual(m["workers_cpu_p99_ms"]["value"], 1109.5)
        self.assertEqual(m["d1_rows_read"]["value"], 2_440_973)
        self.assertEqual(m["d1_rows_written"]["value"], 12_142)
        self.assertEqual(m["ai_neurons"]["value"], 8708.3)

    def test_budget_warning_comes_from_config(self):
        rows = {r["metric"]: r for r in evaluate(cloudflare_metrics(ACCOUNT), BUDGETS)}
        self.assertTrue(rows["ai_neurons"]["warn"])          # 87% of 10 000
        self.assertFalse(rows["d1_rows_read"]["warn"])       # 49% of 5M
        self.assertIsNone(rows["workers_cpu_ms"]["budget"])  # informational
        self.assertIn("⚠️", markdown(date(2026, 11, 17), list(rows.values()), BUDGETS["app_guards"]))

    def test_per_metric_warn_ratio_overrides_default(self):
        # D1 is a hard daily cap since 2026-09-01: warn early (60%) for rows read.
        budgets = {"warn_ratio": 0.8, "warn_ratio_by_metric": {"d1_rows_read": 0.6},
                   "daily": {"d1_rows_read": 100, "d1_rows_written": 100}}
        rows = evaluate([{"metric": "d1_rows_read", "value": 65},
                                      {"metric": "d1_rows_written", "value": 65}], budgets)
        self.assertEqual([r["warn"] for r in rows], [True, False])

    def test_empty_account_is_zero_not_crash(self):
        rows = evaluate(cloudflare_metrics({}), BUDGETS)
        self.assertTrue(all(r["value"] == 0 and not r["warn"] for r in rows))

    def test_actions_counts_only_completed_runs_of_that_day(self):
        runs = [
            {"name": "Gdelt", "status": "completed", "created_at": "2026-11-17T01:00:00Z",
             "run_started_at": "2026-11-17T01:00:10Z", "updated_at": "2026-11-17T01:03:10Z"},
            {"name": "Gdelt", "status": "in_progress", "created_at": "2026-11-17T02:00:00Z"},
            {"name": "Old", "status": "completed", "created_at": "2026-11-16T23:59:00Z",
             "run_started_at": "2026-11-16T23:59:00Z", "updated_at": "2026-11-17T00:09:00Z"},
        ]
        m = {r["metric"]: r for r in actions_metrics(runs, date(2026, 11, 17))}
        self.assertEqual(m["actions_runs"]["value"], 1)
        self.assertEqual(m["actions_wall_minutes"]["value"], 3.0)

    def test_fetch_runs_paginates_until_short_page(self):
        pages = [[{"id": i} for i in range(100)], [{"id": 1}]]
        seen = []

        class R(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def opener(req, timeout):
            seen.append(req.full_url)
            return R(json.dumps({"workflow_runs": pages[len(seen) - 1]}).encode())

        self.assertEqual(len(fetch_runs("o/r", "t", date(2026, 11, 17), opener)), 101)
        self.assertEqual(len(seen), 2)
        self.assertIn("created=2026-11-17", seen[0])


    def test_graphql_denied_still_stores_actions_and_fails_run(self):
        import os
        from unittest import mock
        import scripts.usage_report as u
        stored = []

        class FakeD1:
            def __init__(self, *a): self.database_id = None
            def discover_database_id(self, name): return "id-" + name
            def query(self, sql, params=()): stored.append((sql, params)); return []

        env = {"CLOUDFLARE_ACCOUNT_ID": "acc", "CLOUDFLARE_API_TOKEN": "deploy", "CLOUDFLARE_D1_API_TOKEN": "d1",
               "GITHUB_REPOSITORY": "o/r", "GITHUB_TOKEN": "gh"}
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(u, "_post_json", return_value={"errors": [{"message": "not authorized for that account"}]}), \
             mock.patch.object(u, "fetch_runs", return_value=[]), mock.patch.object(u, "D1Client", FakeD1):
            os.environ.pop("CLOUDFLARE_ANALYTICS_TOKEN", None)
            os.environ.pop("GITHUB_STEP_SUMMARY", None)
            self.assertEqual(u.main(["--day", "2026-11-17"]), 1)
        metrics = [p[1] for s, p in stored if s.startswith("INSERT INTO usage_daily")]
        self.assertEqual(metrics, ["actions_runs", "actions_wall_minutes"])


    def _run_today(self, rows_read):
        import os
        from unittest import mock
        import scripts.usage_report as u
        stored = []

        class FakeD1:
            def __init__(self, *a): self.database_id = None
            def discover_database_id(self, name): return "id-" + name
            def query(self, sql, params=()): stored.append((sql, params)); return []

        acc = {**ACCOUNT, "d1": [{"dimensions": {"databaseId": "a"}, "sum": {"rowsRead": rows_read, "rowsWritten": 10}}]}
        env = {"CLOUDFLARE_ACCOUNT_ID": "acc", "CLOUDFLARE_API_TOKEN": "t", "CLOUDFLARE_D1_API_TOKEN": "d1",
               "GITHUB_REPOSITORY": "o/r", "GITHUB_TOKEN": "gh"}
        runs = mock.Mock(return_value=[])
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(u, "_post_json", return_value={"data": {"viewer": {"accounts": [acc]}}}), \
             mock.patch.object(u, "fetch_runs", runs), mock.patch.object(u, "D1Client", FakeD1):
            os.environ.pop("GITHUB_STEP_SUMMARY", None)
            code = u.main(["--today"])
        days = {p[0] for s, p in stored if s.startswith("INSERT INTO usage_daily")}
        return code, days, runs.called, stored

    def test_today_mode_stores_today_quietly_without_actions(self):
        from datetime import datetime, timezone
        code, days, runs_called, stored = self._run_today(3_500_000)  # 70%: a warn, but not an alarm
        self.assertEqual(code, 0)
        self.assertEqual(days, {datetime.now(timezone.utc).date().isoformat()})
        self.assertFalse(runs_called, "no Actions API paging every hour")

    def test_today_mode_fails_near_the_hard_d1_limit(self):
        self.assertEqual(self._run_today(4_100_000)[0], 2)


if __name__ == "__main__":
    unittest.main()
