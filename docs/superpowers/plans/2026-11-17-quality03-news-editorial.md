# QUALITY-03 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and test-driven-development before changing source.

**Goal:** Prevent observed live D1 misclassification of news and opinion plus expose truthful editorial field completeness.

**Architecture:** Restrict `analyze/group` and `reportingClaim` in current Editor news modules; add optional editorial metadata without changing existing response keys. No new storage/cron/frontend modules.

**Tech Stack:** Cloudflare Workers/Editor, Node 22 `node:test`, native D1 SQL fixtures, GitHub integrated CI.

**Spec:** docs/superpowers/specs/2026-11-17-quality03-news-editorial.md

## Global Constraints
- Code against active `backend/editor/src/`, not `worker/` or frozen baselines.
- No direct D1/Neon writes, no paid AI, cron, secrets, new Workers, or automatic removal of historical source.
- Do not claim production event grouping changed until reconciler has run and live data verified.

## Review Focus
- 'Strike' in a background summary versus a government platform ban in the title.
- Reprinted opinion without an 'opinion' label in the headline.
- Two political actors discussing one topic must not become the same political action.
- Genuine same-action reports from distinct publishers stay grouped.
- A Hebrew title/body with untranslated `verified_note` must not be called fully localized.

### Task 1 — Source-driven C-02/C-03 regression tests
**Files:** `tests/architecture/news-quality.test.mjs`.
- [ ] Add real D1 pair of news headlines/summaries + generic analogous input; assert governance classification, opinion hold, distinct political actors, genuine same-event grouping, non-death background assertion.
- [ ] Observe regression failures before editing production code.

### Task 2 — Implement minimal classification protections
**Files:** `backend/editor/src/news/events.mjs`, `backend/editor/src/news/claim-identity.mjs`.
- [ ] Add generic headline regulatory action rule, explicit opinion document markers, and distinct explicit political actor guard.
- [ ] Fix headline-nonfatal/background-death claim conflation, without losing actual fatality reporting/denial.
- [ ] Confirm original source tests and grouping RED→GREEN; no source-specific hardcodes.

### Task 3 — B-04 editorial field completeness
**Files:** `tests/architecture/editor-localization-content-readers.test.mjs`, `backend/editor/src/localization/editorial-reader.mjs`.
- [ ] Add cache-backed HE title/body + pending RU verified note test; observe RED on missing per-field core completeness info.
- [ ] Add truthful `core_translation_status` and `pending_fields` derived from existing `fieldLocale` without changing overall pending/available or source cache hash.
- [ ] Confirm localization test and full Editor suite GREEN.

### Task 4 — One CI + handoff
- [ ] Integrated and full app CI success on one same PR HEAD, immutable bundle + Worker dry-runs.
- [ ] Record exact CI/PR results and C/B partial scope; no merge/deploy without accepted gate.
