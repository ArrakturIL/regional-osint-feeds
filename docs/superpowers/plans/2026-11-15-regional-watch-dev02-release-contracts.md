# DEV-02 — Release contract hardening implementation plan

> **For agentic workers:** Implement inline with superpowers test-driven-development and verification-before-completion. Single user-approved block; no production deployment.

**Goal:** Prevent Pages Preview from using production D1/Worker bindings, while making the immutable release fail closed when committed Worker configs drift from the declared release contract.

**Architecture:** Keep the existing unified build, version-pinned artifacts and rollback. Extend the existing pure `validatePages` function with a separate opt-in preview-isolation check (production validation must continue to succeed with today's shared preview settings). Wire a read-only `cloudflare-gate.mjs preview-check` step ahead of the existing preview upload; fail closed. Extend `expectedWorkerConfig` to validate source wrangler configs against `release-contract.json` at build and verify time.

**Tech Stack:** Node 22 ES modules, built-in node:test, GitHub Actions. No new packages, services, databases, API tokens or migration.

**Spec:** `docs/REGIONAL_WATCH_MASTER_TODO.md`, DEV-02 A-02/A-04; current `deploy/release-contract.json`; read-only Cloudflare Pages project configuration inspected 15.11.2026 (preview service bindings and both D1 IDs equal production).

## Global Constraints

- Never write Cloudflare config or D1/Neon data in DEV-02.
- Do not merge application/workflow changes to main without separate permission: `main` push triggers coordinated production deployment.
- Keep current production Pages validation and release workflow operational despite currently shared preview bindings.
- Block **only preview deployments** when they are not isolated, with a clear diagnostic.
- No new production credentials, no root-level framework changes, no agents.

## Review Focus

1. Preview config absent, malformed, missing service or DB -> fail closed, no upload.
2. Same production Worker under another binding name, or service environment == production -> fail closed.
3. Same production D1 under another binding name -> fail closed.
4. All preview bindings isolated but production contracts valid -> allow.
5. Static source config drift (wrong cron, D1, AI, missing secrets/keep_vars, unexpected Worker) -> fail before release bundle is published; unchanged real config remains accepted.

### Task 1 — Live preview isolation

**Files:** `scripts/release/cloudflare-gate.mjs`, `tests/architecture/release-pipeline.test.mjs`, `.github/workflows/regional-watch-app-check.yml`.

- [ ] Write test: `validatePages(..., {requirePreviewIsolation:true})` rejects preview sharing *any* production service or D1 (including alias), absent/partial preview, and permits genuinely separate service IDs; default production validation remains unchanged.
- [ ] Run tests on PR and record expected RED.
- [ ] Implement narrow opt-in validator; wire read-only `preview-check` command ahead of all Pages preview writes, using existing Pages token; on unsafe state fail without publishing.
- [ ] Run complete workflow source tests; verify GREEN and verify preview step order and `if` guards.

### Task 2 — Static source contract alignment

**Files:** `scripts/release/build.mjs`, `tests/architecture/release-pipeline.test.mjs`.

- [ ] Add tests with cloned in-memory contract for `expectedWorkerConfig(root,key,contract)` that must reject mismatch in Worker name/cron/D1/AI/secrets/preview policy; real config passes.
- [ ] Record RED.
- [ ] Implement minimal validation; ensure production `packageRelease` and `verifyRelease` use it. No changes to actual Worker config.
- [ ] Record GREEN in PR, run all existing app source suites, checks and release-bundle dry-run, inspect every changed file.

### Task 3 — Report and stop

**Files:** `docs/REGIONAL_WATCH_MASTER_TODO.md`, `docs/research/DEV_02_RELEASE_AUDIT_2026-11-15.md`.

- [ ] Audit other release/writeback workflows; distinguish legacy tests from active deploy.
- [ ] Publish exact CI evidence, live preview risk, implementation/remaining production gating.
- [ ] Mark DEV-02 code stage done but release pending (don't claim production protection until merged/deployed).
- [ ] Report, stop before DEV-03 or merging application changes.
