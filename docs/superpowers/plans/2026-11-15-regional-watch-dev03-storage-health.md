# DEV-03 — Storage health + recovery verification plan

> **For agentic workers:** use superpowers:executing-plans, test-driven-development, and verification-before-completion; one block, no automatic DEV-04 start.

**Goal:** Turn Neon-primary to D1 reconciliation from a single "8/8 verified" heartbeat into source-specific, evidence-based health states, quantify current free-tier usage, and verify last valid snapshot survives error paths.

**Architecture:** Reuse existing scheduled GitHub Actions job (`.github/workflows/collector-shadow-sync.yml` every 2h) and the one Neon connection, SHA-verified Neon snapshots, and the existing D1 read-back. Add pure deterministic age/state/replication classification and bounded annotations/summary; no extra scheduled jobs, storage services, credentials or public API. Integrate only after tests confirm RED and GREEN, full source/release CI.

**Tech Stack:** Python stdlib, existing psycopg and Cloudflare D1Client, GitHub Actions, existing unit suites.

**Spec:** `docs/REGIONAL_WATCH_MASTER_TODO.md` DEV-03 / D-07; `docs/superpowers/plans/2026-11-15-regional-watch-neon-quality.md`; existing sync and source snapshot tests.

## Constraints
- Do not change or erase any of 8 Neon/D1 source payloads in health reporting; existing guarded reconciliation keeps ownership.
- Distinguish source reported `ok` from genuinely fresh: timestamps checked against source's actual workflow cadence with conservative grace.
- Treat partial, stale, unavailable, sync failures and valid cache with GitHub fallback explicitly; never print credentials, URLs or raw articles.
- Do not create new hosting, Redis, paid services or additional schedules.
- Audit actual Neon, D1 and GitHub Actions usage through independent read-only connections; Workers cron counts are estimates unless measured invocation metrics are available.
- Never claim that D1's last **valid** snapshot is a durable, versioned last **healthy** archive. Do not discard legacy last-good fallback until archival retention is demonstrably sound.

## Implementation steps
1. `scripts/test_sync_neon_primary_to_d1.py`: add failing tests for time-bound source states (fresh vs partial vs stale vs unavailable), excessive future skew, D1-ahead state and sanitized report output; observe RED through GitHub Actions.
2. `scripts/sync_neon_primary_to_d1.py`: implement minimal pure classifier based on checked time and source status; retain pre-write Neon full hash validation and D1 digest readback. Print summary + GitHub warnings/Step Summary without duplicating database calls.
3. Run source tests and immutable release pipeline in PR (no production writes), including failure preservation assertions.
4. Cross-check Neon Free consumption/project retention, both D1 file sizes/cache metadata, GH Actions run counts, Worker schedules. Record exact measured vs estimated, state of fallback, resource budget, and residual risk in DEV-03 audit.
5. Add durable last-good strategy only if independent retention proof exists; otherwise mark D-07 partial and explicitly list missing historical restore as a future gate.
6. Publish TODO + checkpoint; do not start DEV-04 automatically. Code PR merge may trigger a production release on main: require separate explicit decision if so.
