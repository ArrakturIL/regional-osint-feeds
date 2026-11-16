# DEV-05 / ARCH-03 — Isolate analyst source-mirror verification and D1 ingestion

**Scope:** BACKEND only. Refactor analyst reader/collector source ingestion without changing collection policy, translation, AI, publication decisions, jobs, quotas or UI. Prior [PR #66] extracted analyst public GET API.

**Baseline:** `main` source SHA `19202aea205e384334d15241ad8627f2454f7f94`, Analyst Editor source Git blob `29623aa4f01a3cdb1b85820a0471763ae0811f88`.

**Boundary:** Create `backend/editor/src/analysts/source-ingestion.mjs` with `createSourceIngestion({HOUR,DAY,plain,assertString})`. The factory contains byte-identical original `MIRROR_BASE`, `MAX_SOURCE_BYTES`, `MAX_BODY`, `VALID_STATES`, `sha256`, `readMirror`, `validateInput`, `insertItem`, and returns those exact functions. `editor.mjs` creates one shared source-ingestion closure after `isoNow`, retaining editorial constants, `HOUR/DAY`, `plain/assertString`, `runEditor` and public `testHooks`. No ESM cycles or duplicate source-of-truth for mirror policy. Crucially: `sha256` still called on normalized source body as before; do not silently change what source-hash covers.

## TDD
- [x] Add mandatory `tests/architecture/editor-analyst-source-ingestion.test.mjs` with strict full-source reconstruction Git blob parity, accepted/rejected Telegram and YouTube inputs, source age/status/hash safety, source mirror restrictions, D1 inserts and revision rules; trigger RED with new module absent.
- [x] Extract original methods and constants, one factory delegate, preserving all original method bodies and source SHA; use source parity reconstructor to prevent semantic drift.
- [x] Verify full mandatory Editor checks, original analyst API checks, integrated checks where workflow matches, immutable three-component bundle GREEN.
- [x] Review diff and merge squash, coordinated production release with independent Cloudflare Pages/Editor/Monitor secrets/crons/bindings/receipt check.
- [x] Update MASTER TODO, DEV-05 audit and plan; remaining `editor.mjs` AI/editorial decision and scheduled queue remain open.

**Non-goals:** Changing source mirror URLs, max bytes, URL validation, content-hash algorithm, freshness, fraud safeguards, publication behavior, AI model/budget, D1 migrations, Cron, frontend, archival B-01, filters or sorting.

**Completion receipt:** [PR #67](https://github.com/ArrakturIL/regional-osint-feeds/pull/67) squash source `1aa3e03f1bbf865d60de267dccaf82b8b099856c`. [RED #43795720623](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43795720623) absent new module → [GREEN #43795888749](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43795888749) app CI including immutable bundle SUCCESS. Full pre-source split exact SHA `29623aa4f01a3cdb1b85820a0471763ae0811f88` and previous Analyst Editor `a4f6289a9f8531278804f0b4dca8b8aee86795fe` reconstructed exactly. [Production #43796008521](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43796008521) SUCCESS, rollback skipped, Cloudflare independent Pages/Editor/Monitor confirmation in MASTER TODO §17. Decision/AI/queue work not yet done; frontend postponed.
