# DEV-05/ARCH-02 — Monitor import boundaries

> **For agentic workers:** use superpowers:executing-plans, test-driven-development, and verification-before-completion. Keep each change isolated.

**Goal:** Expose and remove static cyclic dependencies in the 44 active Monitor source modules without changing any runtime logic or the source cadence.

**Architecture:** Use a Node.js built-in test to read the existing `backend/monitor/build-order.json`, resolve literal relative ESM imports and assert an acyclic graph. Keep this test in the mandatory `monitor-source` job. Do not rewrite other modules or alter the existing concatenated baseline.

**Tech Stack:** Node 22 built-in `node:test`, existing GitHub Actions, immutable esbuild pipeline.

**Spec:** `docs/research/DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md`, `docs/REGIONAL_WATCH_MASTER_TODO.md` ARCH-02.

## Constraints
- No D1/Neon/schema/cron/content changes; no new dependencies.
- Do not delete original Worker snapshots or legacy archives.
- Ensure import parser covers all native named local imports present in Monitor's source tree. Reject missing/out-of-repository module targets.
- A Graph cycle is a code coupling defect, not evidence of production crashes.

## Task 1 (TDD RED)
- [ ] Add `backend/monitor/tests/import-boundaries.test.mjs`: walk all 44 known module files; enforce no cycles or unresolved relative import targets. Derive from manifest, no duplicated 44-path list.
- [ ] Add the test to monitor-source GitHub Actions. Verify RED with specific cyclic paths (e.g. api/json↔api/router, config/constants↔collectors/network/ioda, regions↔adsb, sources↔router), no syntax errors.

## Task 2 (TDD GREEN)
- [ ] Remove unused imports only from `backend/monitor/src/api/json.js`, `config/constants.js`, `collectors/aviation/regions.js`, and `schedule/sources.js`.
- [ ] Verify import graph acyclic, native esbuild bundle passes, source parity tests stay green, all mandatory app CI jobs and integration tests pass.
- [ ] Review diff for source behavior changes: imports only, plus test/workflow/doc.

## Task 3 (review/acceptance)
- [ ] Update DEV-05 audit evidence and TODO ARCH-02 outcome with RED/GREEN run links; code PR review before any production release.
- [ ] On explicit authorized merge, verify normal coordinated release & Workers version and preserve D1/secrets/cron; never claim release on a PR test alone.
