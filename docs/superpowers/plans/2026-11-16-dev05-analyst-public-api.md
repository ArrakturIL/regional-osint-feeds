# DEV-05 / ARCH-03 — Analyst service public read-only API boundary

**Scope:** BACKEND only. This is one lossless architectural slice of `backend/editor/src/analysts/editor.mjs`, not a rewrite of analyst collection, translation or moderation. The owner explicitly deferred frontend and old B-01 corrections.

**Frozen baseline:** `main` source SHA `8f74daea88653e667ca09c4fd7619c32c3ebba6f`, original Analyst Editor Git blob SHA `a4f6289a9f8531278804f0b4dca8b8aee86795fe`.

**Boundary:** New `backend/editor/src/analysts/public-api.mjs` contains old analyst `CORS`, `json` and complete `readApi` (health, analysts, analyst-posts list/detail, unknown routes), with explicit `editorVersion` parameter for health response. `backend/editor/src/analysts/editor.mjs` retains `runEditor`, `validateInput`, source collector, AI rules/budgets, `testHooks`, and default `{scheduled,fetch}`, delegating `fetch` to the new function. No dependency from public-api back into editor (no ESM cycles). Do not modify endpoint response JSON, headers, SQL, source attribution, publish rules or old cron.

## TDD tasks
- [ ] Add mandatory `tests/architecture/editor-analyst-public-api.test.mjs` checking health, GET read-only, profiles, list paging/clamping and original author/URL/metadata, detail/not_found, preserved CORS and direct/editor delegated calls; exact source reconstruction against original Analyst Editor blob.
- [ ] Verify RED (missing module) on GitHub Actions.
- [ ] Move CORS/json/readApi without changing bodies; add explicit version argument only at readApi health and delegation; write deterministic reconstruction helper; preserve legacy `testHooks` and exports.
- [ ] Verify GREEN all mandatory Editor source, integrated data architecture and immutable 3-component bundle; review complete scoped PR diff.
- [ ] Merge squash, coordinated production release, independent Cloudflare Pages/Editor/Monitor read-only binding/cron checks and receipt.
- [ ] Update MASTER TODO, DEV-05 audit and this plan after successful production; leave further `analysts/editor.mjs` ingestion/AI/queue work for next isolated backend PR.

**Never:** frontend/CSS, historical B-01 cleanup, AI throughput increases, D1 migrations, new third-party services, changed source schema or cron in this slice.
