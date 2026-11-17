# QUALITY-02 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development and superpowers:executing-plans. Do all tasks with a source-backed failing test before code.

**Goal:** Factual source comparison diagnostics and source-level localization provenance without changing storage or UI.

**Architecture:** Extend current pure Editor monitor comparison builder and current read-only Event API DTO. Keep current D1 queries, sort, caches and response fields backward compatible.

**Tech Stack:** Node 22, node:test, Cloudflare Editor, SHA-256 WebCrypto.

**Spec:** docs/superpowers/specs/2026-11-17-quality02-provenance.md

## Global Constraints
- No schema/cron/AI changes or production write tests.
- Preserve old API keys, RU/HE identity/order and legacy source parity.
- One PR and one CI gate; report honest partial scope.

## Review Focus
- Missing source snapshots and malformed/zero timestamp values.
- No source update should be called verified incident.
- Comparison window and original article publication are distinct from generatedAt.
- A translated RU headline must never become original-language English.
- Hebrew native alternate sources and pending untranslated articles.

### Task 1: C-04 concrete source comparison and uncertainty
- [ ] Add test: two runs, advancing sources, unchanged sources, new/missing/invalid timestamps; require source_changes and coverage gaps; verify RED in CI.
- [ ] Implement strict finite positive timestamps, bounded source deltas and missing-data reasons; preserve old outcome/event comparison.
- [ ] Verify Editor monitor-changes tests GREEN and read-only route.

### Task 2: B-03 partial raw-original provenance in news DTO
- [ ] Add test: English original plus Russian translation, immutable raw original and hash, per-field display status; verify RED in CI.
- [ ] Add deterministic original-field digest and field display-status fields to current news API; no D1 writes/new reads, no pagination change.
- [ ] Verify full news-quality and localization tests GREEN.

### Task 3: Combined CI and handoff
- [ ] Full application CI immutable Pages+Editor+Monitor build and Worker dry-run GREEN.
- [ ] Save exact PR, CI and remaining boundaries in docs; no automatic deploy.