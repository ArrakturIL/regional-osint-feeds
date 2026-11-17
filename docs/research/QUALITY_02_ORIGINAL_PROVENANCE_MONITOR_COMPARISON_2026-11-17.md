# QUALITY-02 — C-04 coverage и B-03 original provenance (17.11.2026)

**Status:** [PR #86](https://github.com/ArrakturIL/regional-osint-feeds/pull/86), implemented on branch; **not merged / not deployed**.

**TDD:** RED [integrated CI #44012829153](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44012829153) reproduces B-03 `original_language` missing; [application CI #44012829254](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44012829254) reproduces C-04 null-as-0 count false positive. Final GREEN [integrated data CI #44013098207](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44013098207) (1 successful offline job, private Neon job skipped by PR contract) + [full application CI #44013098316](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44013098316): 11 executed successful jobs, 0 failures, immutable Pages/Editor/Monitor build, two Wrangler `--dry-run`; publish jobs intentionally skipped.

## C-04
- Existing `buildDigest` now counts only **positive valid integer** source maxima (null/empty/zero cannot be silently converted into comparable timestamp 0).
- `sourceChanges` lists each advanced source with previous/current epoch milliseconds and `kind:'source_timestamp_advanced'`; not an independently verified news event.
- `sourceGaps` identifies missing latest/previous snapshots and invalid timestamps by source. `independentPrimarySources:null` explicitly avoids pretending the source count is independently verified corroboration.
- `readMonitorChanges` adds actual HTTP response `generatedAt`; existing status, journal changes, comparison interval, RU/HE, no-store/read-only behavior unchanged.
- Historical v64 byte-parity remains guarded: only the well-defined C-04 extension is normalized in the frozen test; unrelated Editor functionality still requires exact parity.

## B-03 (API portion only)
- `/api/news` cards now return `original_language`, `original_headline`, `original_summary`, deterministic `source_hash` of **raw original fields**, `field_translation_status` for displayed headline/summary.
- Hash is SHA-256 over `JSON.stringify([originalHeadline,originalSummary])` (UTF-8); independent of RU translation, HE alternate cache, or topical event ordering.
- Existing `source_language`, locale state, `translation_state`, `feed_order_hash`, pagination, and immutable original article link are preserved. Tests verify RU translated and HE pending same raw original + source hash. **No D1 migration or new persistence**: full field-level D1 lifecycle and idempotent refresh remain B-03 scope.

**Limit:** This PR does not close entire C-04 (other primary corroboration, UI) or B-03 (D1 persistence / refresh), nor B-02/B-04/C-02 and global QA. No live Cloudflare claim for this branch. No new AI, secret, cron, Worker, cost or DB writes. ARCH-04/05 conditional planning and independent acceptances unchanged.

**Next gate:** deliberate merge → coordinated production release → independent Cloudflare and HTTP check before updating live statuses.
