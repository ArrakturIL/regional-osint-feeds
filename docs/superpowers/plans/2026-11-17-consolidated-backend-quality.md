# Consolidated Backend Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and test-driven-development. Steps are checked with evidence, not intent.

**Goal:** One source-backed, regression-tested PR for E-06, C-01/C-03/C-05 safety and E-05.

**Architecture:** Extend current analyst validation, event API DTO and Polymarket Pages adapter without adding modules, runtime dependencies, migrations or UI edits. Preserve historical baseline in tests.

**Tech Stack:** Node 22, native node:test, Cloudflare Pages/Workers, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-11-17-consolidated-backend-quality.md

## Global Constraints

- No production writes, D1/Neon migrations, cron, new AI calls, paid services or legacy deletion.
- Tests must execute against active backend sources and remain in mandatory CI.
- No auto-merge/deploy without separate confirmed release authority; do not label ARCH-04/05 pass.

## Review Focus

- Cyrillic Unicode boundaries versus explicit negation and similarly named terms.
- Reversed YES/NO outcome order, invalid prices, suspended/closed markets.
- Last event update versus original article publication and first-seen timestamps.
- Attribution: publisher count versus independent verification.
- Stable RU/HE order and pagination, immutable contract release.

### Task 1: E-06 analyst headline guard

**Files:** `backend/editor/src/analysts/editorial-decision.mjs`, `tests/architecture/editor-analyst-decision.test.mjs`, `tests/architecture/analyst-decision-source-parity.mjs`.

- [ ] Add explicit Russian certainty and negation behavior tests, run mandatory CI (RED).
- [ ] Implement Unicode-aware safeguard, preserve historical byte-parity as an intentional documented E-06 exception.
- [ ] Confirm the validator and Editor CI GREEN.

### Task 2: C-01/C-03/C-05 event provenance and chronology

**Files:** `backend/editor/src/news/api.mjs`, `tests/architecture/news-quality.test.mjs`, `.github/workflows/regional-watch-app-check.yml`.

- [ ] Add event update versus original publication, source assertions and locale parity tests; run RED.
- [ ] Return explicit timestamp provenance/source-claim fields, avoiding any unsupported claim of verification.
- [ ] Confirm news-quality and Editor source CI GREEN.

### Task 3: E-05 market price accuracy

**Files:** `backend/pages/src/api/data.js`, `tests/architecture/pages-data.test.mjs`.

- [ ] Add test with reversed YES/NO price order, invalid/closed markets and semantically typed YES token; run RED.
- [ ] Implement strict outcome selection and caveat without changing existing market cards.
- [ ] Confirm Pages-data CI GREEN.

### Task 4: Consolidated release gate and docs

- [ ] Full mandatory 3-component immutable build, dry-run and regressions GREEN on same PR HEAD.
- [ ] Record exact test evidence in canonical MASTER TODO and report; PR stays unmerged and production untouched unless separately authorized.
