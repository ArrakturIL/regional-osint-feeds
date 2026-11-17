# Consolidated backend quality design — 17 November 2026

**Intent:** Land coherent, source-backed safety and provenance corrections in one review/CI cycle, rather than separate agent runs and production releases.

**Source:** `docs/REGIONAL_WATCH_MASTER_TODO.md` items E-06 (P1), C-01/C-03/C-05 (P1/P2), E-05 (P2); existing `backend/editor/src/analysts/editorial-decision.mjs`, `backend/editor/src/news/{api,events}.mjs`, `backend/pages/src/api/data.js`.

**Scope:** (1) reject misleading confident Cyrillic analyst headlines without blocking explicitly negated claims, (2) expose faithful and independently sortable publication/event timestamps and source assertions in existing news DTO while preserving RU/HE parity and stable paging, (3) label Polymarket YES-token prices accurately and respect actual outcome order and market state. No new endpoint, Worker, dependencies, database migration or cron. Existing fields remain backward compatible wherever safe.

**Trade-offs:** A single massive rewrite creates debugging risk; isolated, tested changes in one PR reuse existing modules and CI. No speculative repairs of archived B-01 rows, no UI changes, no real D1 writes. Freeze legacy baselines; preserve its historical parity evidence with an explicit, narrowly scoped E-06 exception if required.

**Acceptance:** RED→GREEN tests on actual source; source-editor, Pages-data, news-quality tests in mandatory CI; green immutable 3-component dry-run. PR only. Merge/deploy needs the separate release gate; ARCH-04/05 scheduled acceptance unchanged.

**Implementation checklist:**
- [ ] Add regression tests for Cyrillic claims + negation, outcome YES position/closed markets and event chronology/provenance; observe the expected failing CI.
- [ ] Implement narrow safe production behavior changes, protecting frozen baseline and source ownership.
- [ ] Run green mandatory CI with complete immutable build/dry-run and summarize observed coverage.
- [ ] Update master TODO statuses and handoff with exact evidence; do not mark broad C/B work done solely from isolated tests.
