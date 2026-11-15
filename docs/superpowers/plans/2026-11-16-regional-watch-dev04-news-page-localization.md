# DEV-04 — Page-scoped news localization

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans or superpowers:subagent-driven-development. TDD RED→GREEN and final verification required.

**Goal:** Avoid running expensive Hebrew/Russian news localization and optional Hebrew native-source substitution for every event when /api/news only returns a small offset page.

**Architecture:** Keep full eventRows and locale-independent ordering, priority/soft publisher cap, feed_order_hash and total_events computation exactly as currently defined. Move only output localization + Hebrew alternate lookup after deterministic pagination. Do not affect existing source assertions, ordering, D1 schema, translations, AI, cache keys, or pagination shape.

**Tech Stack:** Node 22 built-in test runner, Cloudflare Worker JS ESM, existing D1 API. No dependencies or services.

**Spec:** `docs/REGIONAL_WATCH_MASTER_TODO.md` DEV-04. Direct baseline evidence from `backend/editor/src/news/api.mjs`: `Promise.all(rows.map(localizeNewsRow))` and Hebrew alternative lookup happen before `visible.slice(offset,offset+limit)`, although only 6–12 articles appear. Confirm with test, not intuition.

## Global Constraints

- Exact RU/HE same event IDs, order and feed_order_hash; latest remains chronological; priority cap unchanged (must operate on original source).
- Preserve total_events, next_offset, feed_rank and translation_summary semantics, locale/source provenance and native Hebrew fallback.
- Never change D1, Neon data, source collection schedules, or AI budgets.
- No new dependencies or synchronous per-request network fetches.
- No unrelated frontend layout/CSS or large architecture rewrite.
- Changing main triggers coordinated production release — separate release review before merge.

## Review Focus

1. 32 raw events, 4-per-page Hebrew requests → ≤4 regional_i18n lookups, not 32.
2. Hebrew native-source alternatives looked up for only selected page and not capped globally at 150 *before* paging.
3. `latest` vs `priority` / soft publisher cap generate same locale-invariant order for limit 1, 4 and offset pages.
4. Empty list, invalid pagination, total_events/next_offset and translation_summary remain correct.
5. Consistent feed_order_hash regardless of locale and page size; no false `translation_status=available`.

### Task 1: Reproduce and measure redundant pre-pagination localization

**Files:** `tests/architecture/news-quality.test.mjs`.

- [ ] Add CountingEventDB with real `readNewsEvents` call: 32 synthetic event rows with English sources, Hebrew locale page limit 4 offset 8.
- [ ] Assert only 4 cached i18n lookups; real `total_events=32`, `feed_order_hash` stable RU/HE; run Actions test and capture expected RED with 32 DB lookups.
- [ ] Add native Hebrew alternate lookup sample and assert lookup is restricted to selected page.

### Task 2: Move expensive per-row work after stable page selection

**File:** `backend/editor/src/news/api.mjs`.
- [ ] Sort raw rows using the same event_priority, last_seen_ms and publisher(source) as translated metadata (not localized text).
- [ ] Apply exact same existing soft publisher cap and hash over **all** ordered event IDs.
- [ ] Slice required page rows; only then perform Hebrew alternative lookup and localizeNewsRow for page entries.
- [ ] Keep shape, feed_rank, translation summary and total unchanged. Run new and existing RU/HE/sort/pagination tests GREEN.
- [ ] Run full CI: Editor, Monitor, Pages, modern bundles and release dry-run; zero production writes while on feature branch.

### Task 3: Document measured result and report

**Files:** `docs/research/DEV_04_NEWS_LOCALIZATION_AUDIT_2026-11-16.md`, `docs/REGIONAL_WATCH_MASTER_TODO.md`.
- [ ] Compare concrete before/after query counts and invariant output; no invented Cloudflare CPU measurements.
- [ ] Only after user-approved production release may DEV-04 be marked fully deployed. Keep independent UI/QA and OSS separate.
- [ ] One-block stop with PR and current status; no DEV-OSS or another feature without a new command.
