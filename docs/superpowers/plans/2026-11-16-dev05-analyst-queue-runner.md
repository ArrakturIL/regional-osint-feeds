# DEV-05 / ARCH-03 — isolate analyst scheduled queue and run orchestration

**Scope:** BACKEND only. Last major Analyst Editor responsibility split. Move frozen queue, mirror status and scheduled D1 processing without changing runtime behavior, AI quotas or source policy. Previous PRs #66/#67/#68 separated public API, mirror ingestion and AI decisions.

**Baseline:** main SHA `8baa0db3b4ed3c6ed368eaf77a71aa66a6a66c9b`, `backend/editor/src/analysts/editor.mjs` original blob `945a01b602c43b164e30b9fc646803c249fd9600`. Preserve earlier `742091e2b6818d2cae585985dadb27401e1d02e5`, `29623aa4f01a3cdb1b85820a0471763ae0811f88`, `a4f6289a9f8531278804f0b4dca8b8aee86795fe`.

**Boundary:** new `backend/editor/src/analysts/queue-runner.mjs` exports `createAnalystQueue({EDITOR_VERSION,HOUR,DAY,MAX_AI_PER_RUN,REGION,plain,readEditorCachedPair,readMirror,sha256,validateInput,insertItem,decide})`, returning frozen `{prioritizePending,runEditor}`. Move original contiguous text from `// Rotate authors ...` to before `export default` verbatim into factory. `analysts/editor.mjs` becomes a small composition root with current model, constants/helpers, source/decision/API factories and original `{scheduled,fetch}`, public `testHooks` unchanged. No ESM cycles.

## Tasks / TDD
- [ ] Add mandatory `tests/architecture/editor-analyst-queue-runner.test.mjs` with original SHA exact reconstruct, round-robin fairness/metadata-only ordering, per-hour run idempotency, stale/missing cached mirror partial with processing pending, valid mirror source and source-body SHA, max 3 AI-eligible new candidates/run, exceptions as per-source errors not global untracked failure, final status/cron semantics.
- [ ] Observe RED editor CI for absent queue module.
- [ ] Exact extraction and chained source reconstruction, restore prior SHA pins and exported objects.
- [ ] GREEN full Editor mandatory CI and immutable triple bundle, inspect PR diff, merged squash.
- [ ] Coordinated production deployment and direct Cloudflare read-only page/worker/cron/secret checks; archive release receipts.
- [ ] Update MASTER TODO, audit and plan, mark ARCH-03 module split complete **only for specified module extraction scope**, keep ARCH-01/04/05/06/07 and backend quality/API P1 checks open. Frontend remains deferred.

**Non-goals:** no cron changes, new sources, retries, AI counts/limits, data writes beyond unchanged original path, schema, prompt, UI, old B-01, E-06 Unicode guard bugfix, C-01 news chronology, or translation throughput tuning; those remain separate backend blocks.
