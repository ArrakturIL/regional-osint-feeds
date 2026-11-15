# DEV-03 checkpoint — 16 Nov 2026

## Source of truth

Main `docs/REGIONAL_WATCH_MASTER_TODO.md`, block DEV-03 / D-07 remains **[~]** while code has not been published and historical last-good storage not proven. See measured [live audit](./DEV_03_STORAGE_HEALTH_AUDIT_2026-11-16.md).

## Ready in isolated branch

- [Draft code PR #40](https://github.com/ArrakturIL/regional-osint-feeds/pull/40), branch `feature/dev-03-source-health-20261115`, HEAD `45ce7c71253bc3e9ee4bd8e3ef5476b7e39ba956`. Diff: Python Neon→D1 reconciler + tests, Monitor/Editor private cache readers + their tests, and scoped plan. **Not merged into main**.
- Full app source [CI #43768142036](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43768142036): **11/11 successful jobs**, 0 failed; Pages preview and coordinated production deploy jobs **skipped**. Parallel [offline integrated architecture #43768142022](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43768142022) succeeded.
- Previous RED runs reproduced actual missing protections: [#43766428166](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43766428166) source health not classified, [#43767931791](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43767931791) no reader fallback reason. Follow-up tests prove retained D1 checksum/checked timestamp, last-valid hold, retained-age vs broken source-age, source-specific warning + redaction, production logger 1/hour/source/reason/isolate, no DTO change.
- Runtime: unchanged existing 2-hour Neon→D1 scheduled job would emit source health in logs and `GITHUB_STEP_SUMMARY`, without new schedule, services, extra API credentials or billing tier. During a source error or stale state, only checksum-confirmed preexisting D1 last-good is retained; missing/corrupt D1 gives explicit job failure instead of false "good".
- Read side Monitor/Editor: fallback retains the same GitHub data path and outputs, with new bounded logs (enabled sources only) for cache_missing/cache_invalid/cache_stale/cache_unavailable.

## Independent read-only account audit

- Neon Free v3 `regional-watch-data`: 8 source snapshots (6 ok, 2 partial), snapshot table 253952 bytes, project last-used usage counters compute_time_seconds=2103, active_time_seconds=8340, data_transfer_bytes=5213545, 6-hour instant restore window, 1GiB project logical limit.
- Cloudflare D1 production `regional-osint` 11,612,160 B; `regional-watch-news` 6,254,592 B. Eight cache rows. Real daily D1 row reads/writes unknown.
- Github 433 Actions runs on Nov 15, standard runners free because repository public; account artifact storage usage unknown. Monitor cron 1m, Editor 5m => theoretical 1728 daily triggers, **not** measured Worker CPU/invocations.
- Source health issue: `marad` `ok` but snapshot timestamp 08:09 UTC 15 Nov — stale relative to later checks; `copernicus` and `satellite` partial.
- No live data migrated, no Cloudflare/Neon update, no production URL/content/UI changes.

## Important unresolved boundaries

- Neon and D1 currently store only one source snapshot per source; retaining previous D1 on error/stale is useful but **not historical versioned backup**. Incoming partial snapshot can supersede prior OK. Long-duration archival recovery and safe same-timestamp corruption repair need a separately designed/verified retention gate.
- Reader fallback log generation is unit-tested, **not observed in production Workers**. Per-isolate throttling is not an account-wide logging quota.
- Live Workers CPU, actual D1 row/day, full GitHub artifact storage and notification routing remain unmeasured. Never claim billing guaranteed solely because two D1 database files are small.
- Main code PR #40 triggers coordinated production release **and** a Neon→D1 reconciliation on main push. Do not merge without an explicit go for both actions, release receipts and a post-release live source check.
- Keep DEV-04, OSS branch and independent global QA untouched until specifically authorized. One DEV block at a time.

**Next resumed action:** approve or review PR #40 production integration; then inspect actual Actions release/replication logs and D1 read-only state. Separately plan versioned last-good retention, not a surprise schema migration.
