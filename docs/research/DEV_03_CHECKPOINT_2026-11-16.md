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

---

## Supplemental checkpoint after connectivity interruption — 16 Nov 2026

**Current authority:** only current `main` TODO and exact live GitHub files. The older PR HEAD/CI snapshots above are historic.

- DEV-03 code PR **#40** is now **ready for review, unmerged**. Current head `b0fcaf9716da8aca0bb24e08216cbf82a2d2ad69`, full app CI [#43769577079](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43769577079) **11/11 success**, storage CI [#43769577085](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43769577085) **success**; neither deployed to production. Includes additional TDD future timestamp protection: [RED #43769512553](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43769512553) → GREEN, no erroneous future-dated `ok` D1 overwrite.
- Newer live Neon audit: 8 sources **5 ok / 3 partial** (GDELT became partial), table 253952 B, free-plan counters 2280 sec compute-time / 9040 sec active-time / 5299277 B transferred. D1 core 11677696 B, news 6258688 B; 456 GitHub Actions runs recorded 15 Nov UTC. All counters are snapshots, not a billing statement. Details in [audit addendum](./DEV_03_STORAGE_HEALTH_AUDIT_2026-11-16.md).
- DEV-03/D-07 remains **[~]**, because full versioned recovery archive and restore exercise, real Worker fallback logs, per-day D1 rows and Worker CPU usage remain unverified. Existing validated single-row D1 last-good is **not equivalent** to an archived version history.
- **No code merge, no production writes, no new services or pricing plan.** Before merge, owner must authorize production deployment AND the scheduled Neon→D1 source reconciliation triggered by push to main.
- Next action on an explicit owner command: code review/fresh compare, merge PR #40, watch complete coordinated release and replica-sync, confirm source statuses and non-sensitive logs. Separate follow-up is to design/test versioned retention before claiming D-07 fully closed. DEV-04/OSS stay untouched.

---

## Final accepted DEV-03 checkpoint — 16 November 2026

Earlier "not merged" checkpoints above are historical. Owner deferred versioned long-term backups / whole-storage restore indefinitely; these do not exist and are not part of current DEV-03.

- [PR #40 merged](https://github.com/ArrakturIL/regional-osint-feeds/pull/40) into main source SHA f4347ff936bf04ec0c90d3e273db8826d370feec.
- [Coordinated production release #43770540419](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43770540419): 12 successes, 0 failures, rollback skipped.
- Cloudflare independently reports Pages production 4c163629-8aec-4332-8471-a4527f857bda successful; Editor 7cd1bace-0647-4e67-a6fd-515a81756efc 100%, Monitor aecc946a-b28b-4578-a1bd-d028de51a86b 100%. Existing D1/AI/secret/cron bindings preserved.
- [First real scheduled-source reconciliation triggered by main push, run #43770540423](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43770540423): 8/8 SHA-integrity verified; 2 fresh, 3 partial, 3 stale. A technically successful sync no longer conceals source incompleteness and age.
- Reader fallback warning mechanism deployed, but no live failure induced or observed; real Worker CPU/D1 daily rows usage remains unmeasured. Do not equate these with a visual or full content QA pass.
- No new backup, paid service, billing requirement or data migration.

**Status: DEV-03 [x] in narrowed owner-accepted scope.** DEV-04 may now be done as the next distinct block; OSS is deferred.
