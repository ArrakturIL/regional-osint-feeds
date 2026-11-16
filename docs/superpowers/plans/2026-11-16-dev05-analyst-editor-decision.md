# DEV-05 / ARCH-03 — isolate analyst editorial decision and AI publication logic

**Scope:** BACKEND only. Extract the existing editorial decision, model prompt, per-day AI reservation and D1 publication logic without changing behavior. Separate work on scheduled queue and quota diagnostics is later; frontend and historical B-01 excluded.

**Frozen source:** main code SHA `83eeb4812916d36d54be17ce7b89871f8c0aac8d`; `backend/editor/src/analysts/editor.mjs` Git blob `742091e2b6818d2cae585985dadb27401e1d02e5`. Earlier source-ingestion split SHA `29623aa4f01a3cdb1b85820a0471763ae0811f88` and original analyst public-reader SHA `a4f6289a9f8531278804f0b4dca8b8aee86795fe` remain hard-pinned.

**Boundary:** new `backend/editor/src/analysts/editorial-decision.mjs` exports `createAnalystDecision({EDITOR_VERSION,MODEL,DAY,MAX_AI_PER_DAY,REGION,PROMO,isCommercialAd,plain,bodyWords,similarity,assertString,isoNow,translatedForEditorial})` and returns `{validateDecision,aiDecision,reserveAi,decide}`. Original contiguous method bodies move byte-for-byte from `function validateDecision(d, original)` through `async function decide(...)` into this factory. The preexisting `backend/editor/src/analysts/editor.mjs` keeps `prioritizePending`, `runEditor`, source ingestion, editor exports and original `testHooks`; instantiate factory once with the original dependencies, without an ESM import cycle. No changes to author/source checks, prompts, D1 decisions, AI model, 14/day and 3/run limits, quality safeguards or HTTP.

## Execution / TDD
- [x] Add mandatory `tests/architecture/editor-analyst-decision.test.mjs` covering direct original validation, near-verbatim/fabricated quotes, skip/needs-data, reserve 14/day and per-item already attempted, AI output contract, original author attribution, rules-only no-neurons skip, D1 publication/decision provenance. Source-parity test must reconstruct exact pre-split editor Git blob.
- [x] Verify TDD RED on missing decision module in GitHub editor-source CI.
- [x] Move code byte-for-byte, instantiate factory and update previous `reconstructAnalystIngestionEditor()` helper to use new decision-stage reconstructor; preserve old frozen hashes and testHooks.
- [x] Verify all mandatory Editor tests GREEN, immutable three-component bundle, diff scope and production-safety checks.
- [x] Ready/merge PR squash, coordinated production deploy, direct read-only Cloudflare verify Pages/Editor/Monitor versions, bindings and crons.
- [x] Update MASTER TODO, audit and plan after proof. Leave scheduled queue and pending/backlog optimization as distinct future backend work.

**Non-goals:** no new translations or calls, AI budget, retry policy, schema, cron, news sorting, feature, frontend, archived B-01 fixes, or external services.

**Completion receipt:** [PR #68](https://github.com/ArrakturIL/regional-osint-feeds/pull/68) merged code SHA `d545a69bd1ded8b0000a5f318bc3035e47583ec1`. [RED #43796810433](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43796810433) expected missing decision module → [GREEN #43797092134](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43797092134) complete mandatory app CI and immutable 3-component bundle. Exact original editor Git blob SHA `742091e2b6818d2cae585985dadb27401e1d02e5` and two previous pins restored. [Production #43797220991](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43797220991) completed SUCCESS, rollback skipped, Cloudflare Pages/Editor/Monitor independent read-only postcheck recorded in MASTER TODO §18. Identified separate old Cyrillic `\\b` headline guard defect, tracked E-06; not changed in this lossless release. Scheduled queue and backend quota work still pending.
