# C-TIME-01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:test-driven-development and superpowers:verification-before-completion before PR review/merge.

**Goal:** Truthful source publication and observation times plus safe client paging across feed changes.

**Architecture:** In `backend/editor/src/news/events.mjs` carry existing `discovered_ms` into materialized `sources_json`; in `backend/editor/src/news/api.mjs` expose explicit provenance and guarded optional page continuation. Additive API; no schema/front-end changes.

**Tech Stack:** Cloudflare Editor Worker, D1, Node `node:test`, GitHub Actions immutable 3-component release.

**Spec:** docs/superpowers/specs/2026-11-17-c-time-provenance.md

## Global Constraints
- No B edits, D1/Neon manual writes, schema migrations, AI calls or cron changes.
- Maintain old fields and source order, and no fabricated event timestamp.
- Do not claim B/C closed until live API and D1 postcheck.

## Review Focus
- Publication can precede ingestion by hours; treat them separately.
- Older index without discovered time returns `null`, not fake `0`.
- RU/HE share order hash and pagination regardless of translation caches.
- Source feed changes between pages trigger 409 only if caller opted into hash guard.
- Tampered hash is 400 and should not read D1.

### Task 1 — RED tests
**File:** `tests/architecture/news-quality.test.mjs`.
- [ ] Assert `reconcile` query selects discovered_ms and source serializer carries collected_ms.
- [ ] Assert readNewsEvents exposes 4 distinct publication/collection fields and honest unknown occurrence time.
- [ ] Assert stable hash page token and 409 on feed change, 400 on invalid token, no unnecessary per-card localization before the guard.
- [ ] Run CI on tests-only HEAD, observe correct failing assertions.

### Task 2 — minimal GREEN
**Files:** `backend/editor/src/news/events.mjs`, `backend/editor/src/news/api.mjs`.
- [ ] Carry validated discovered_ms through existing ordinary reconciliation (no new queries).
- [ ] Add additive API fields and clock basis metadata (old fields unchanged).
- [ ] Add early optional token validation/mismatch guard and deterministic recovery.
- [ ] Run all Editor tests, integration suite, immutable bundle and Wrangler dry-runs in CI.

### Task 3 — review/release gates
- [ ] Report exact RED/GREEN CI, affected files and explicit remaining C-02/C-03/C-04 work.
- [ ] Review and only then authorized main merge/coordinated release.
- [ ] Independent production D1/HTTP verification; archive result in MASTER TODO.
