# REGIONAL WATCH — read-only GitHub ↔ D1 collector cache audit
**Observed:** 2026-11-15 (UTC). **Status:** INTEGRITY PASS / FRESHNESS PARITY FAIL.  
**Execution branch:** `work/regional-watch-execution-20261115`. **No data writes, no flags, no deploy.**

## Evidence and method
- Read-only Cloudflare D1 SELECT: `regional-osint.regional_collector_cache`, all 8 rows.
- Parsed each live D1 `data_json` and `status_json`, recalculated **SHA-256 of recursive sorted-key canonical JSON** and compared both stored digest columns; verified `checked_at_ms` equals parsed status timestamp (within 1ms).
- **All 8/8 content hashes + timestamps matched**, SQL reported `rows_written=0`.
- Read current GitHub `main` collector mirror status files via GitHub connector, compared their actual `checked_at` or synthetic `generated_at` against D1. This is a timestamp health comparison, **not** proof that the raw documents have identical content for any differing timestamp.
- This snapshot does not establish automatic fresh Neon→D1 recurring delivery. It proves one-off D1 cache integrity only.

## Per-source comparison
| Source | GitHub main UTC checked_at | D1 UTC checked_at | D1 vs GitHub | Data state in D1 |
|---|---|---|---|---|
| analysts | 15 Nov 12:19:49 | 14 Nov 23:51:22 | **12.47h behind** | partial |
| centcom | 15 Nov 12:07:50 | 14 Nov 19:59:54 | **16.13h behind** | ok |
| copernicus | 15 Nov 06:25:54 | 14 Nov 22:21:38 | **8.07h behind** | partial |
| gdelt | 15 Nov 09:47:17 | 15 Nov 13:39:17 | **3.87h ahead** (validated one-off fresh GDELT) | partial |
| marad | 15 Nov 08:09:29 | 14 Nov 18:48:23 | **13.35h behind** | ok |
| news_translation | 15 Nov 06:29:35 | 14 Nov 22:24:33 | **8.08h behind** | ok |
| satellite | 12 Nov 11:08:30 | 12 Nov 11:08:30 | **same capture**, but >72h old at audit | ok |
| unosat | 15 Nov 06:35:34 | 14 Nov 18:03:55 | **12.53h behind** | ok |

**Interpretation:** six D1 rows are older than the live GitHub mirror, one is newer only due to a controlled GDELT acceptance run, and one matches an already old source. No source-based read cutover may be treated as proven. The satellite Monitor source already has its own 72-hour stale guard; do not label a stale record a new conflict incident.

## New durable regression and operator command
- `scripts/audit_collector_cache.py`: read-only, per-source SHA/timestamp validation and comparison against eight on-disk GitHub collector files; returns `matched | cache_behind | cache_ahead | equal_time_conflict | invalid_cache | missing_cache`, never articles or credentials.
- `scripts/test_audit_collector_cache.py`: no network/credentials; tests pass/fail decisions, tampering, partial states, missing cache and secret-less access. GitHub app CI now includes this offline regression (no production query).
- On an authorized runner **with scoped D1 access**, in repository checkout: `python -m scripts.audit_collector_cache --root .`. Requires `CLOUDFLARE_D1_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as environment variables. Exit 0 only when all eight match, 1 for drift (expected until shadow rollout), 2 for unavailable setup/API. Do not run on every visitor or every-minute Worker cron.

## Next mandatory gates
1. Confirm branch/main SHA and schedule mapping. Add recurring **shadow-only** sync one source at a time under existing feature flags, preserving legacy GitHub writebacks; do not change production `REGIONAL_NEON_PRIMARY_SOURCES`.
2. Obtain multiple independently fresh runs, inspect valid timestamp/hash parity and no paid overage. Include tests for missing secret, missing source, stale snapshot, failed writes and fallback.
3. Test Monitor and Editor actual read flags in isolated QA; ensure current fallback and no false `ok` reporting on partial/error sources.
4. Only then evaluate per-source GitHub commit retirement and release, with QA approval.

**Related:** [Master TODO](../REGIONAL_WATCH_MASTER_TODO.md), [Neon–D1 runbook](../architecture/neon-d1-sync-runbook.md), [release manifest](../REGIONAL_WATCH_RELEASE_MANIFEST_2026-11-15.md), [execution checkpoint](../REGIONAL_WATCH_EXECUTION_CHECKPOINT_2026-11-15.md).
