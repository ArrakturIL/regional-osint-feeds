-- D1 budget (19.11): /api/overview reads the latest Monitor run with
-- ORDER BY recorded_at_ms DESC LIMIT 1; without this index every call scanned
-- the whole monitor_runs table (~390 rows read for 1 row returned).
-- Additive and idempotent; rollback: DROP INDEX monitor_runs_recorded.
CREATE INDEX IF NOT EXISTS monitor_runs_recorded ON monitor_runs(recorded_at_ms DESC);
