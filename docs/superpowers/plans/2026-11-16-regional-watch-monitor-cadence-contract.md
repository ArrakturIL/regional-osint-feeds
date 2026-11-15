# DEV-05 / ARCH-04 — Monitor cadence contract

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans and test-driven-development. Check every step against current main.

**Goal:** Prevent silent drift between 26 registered Monitor source cadences (`sources.js` `every`) and actual modulo based scheduler (`runner.js`).

**Architecture:** Preserve all established trigger minutes and budget-saving conditional rules. Export a pure function from the existing `runner.js` to return automatically selected source names before provider cooldown, missing secrets and manual runs. Call it from the existing `runSchedule` implementation. Compare scheduled daily eligibility against source registry in Node 22 unit tests; do NOT add new workers, new cron or source reads.

**Tech Stack:** Node 22, node:test, existing native ESM Monitor and GitHub Actions CI.

**Scope and safety:** No schedule change, no I/O in planner, no D1/schema changes, no budget assumptions for secrets/cooldown/failed providers. Tests guard declared *eligibility*, not proof of actual HTTP requests. `source_status` holds real per-source states; platform Cron job success does not imply every upstream returned healthy data. Keep `manual` and `adsb.lol` cooldown logic in runner.

## Task 1: TDD RED
- [ ] Add `backend/monitor/tests/schedule-cadence.test.mjs` expecting pure `scheduledSourceNames(minute)` from runner, all registered 26 sources, unique due list, exact intervals on all 1440 UTC minutes + wrap.
- [ ] Add to mandatory monitor-source CI; verify RED is missing scheduling contract function, not bad syntax.

## Task 2: TDD GREEN
- [ ] Refactor only the existing group and supplemental selection inside `backend/monitor/src/schedule/runner.js` into the pure exported `scheduledSourceNames(minute)`. Return deduplicated array and use in actual runner before manual/cooldown checks; no source timing changes.
- [ ] Run complete monitor-source, source cache, modern bundles, production immutable dry-run and app CI. Verify 26/26 cadence aligns to `every`, no missing/source names, no changes to D1/AI/secret/crons.

## Task 3: evidence and rollout
- [ ] Append RED/GREEN run IDs, exact registered vs scheduled counts, and source-status distinction to DEV-05 audit and canonical TODO.
- [ ] Production deployment via normal coordinated release; verify Pages/Editor/Monitor and D1/cron bindings, no expanded source quotas.
