# DEV-02 checkpoint — 15 November 2026

**Primary state:** `docs/REGIONAL_WATCH_MASTER_TODO.md` is the sole current checklist. Block DEV-02 is **PARTIAL [~]**: code prepared and tests run, **production not changed**.

## What happened

- Read-only live Cloudflare Pages audit discovered preview bindings to both production Workers and both production D1 databases. Canonical production Pages deployment was healthy. Read-only Editor/Monitor settings, D1/AI/secret *names*, cron and disabled preview URLs matched the release contract.
- [Draft code PR #37](https://github.com/ArrakturIL/regional-osint-feeds/pull/37), branch `feature/dev-02-release-contract-guard-20261115`: fail-closed preview isolation gate plus source-controlled Worker/Pages release-contract validation. No D1 migrations, no Cloudflare writes or deploys.
- TDD RED evidence: [workflow #43763080780](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43763080780) missing preview rejection; [#43763279324](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43763279324) missing source contract check.
- GREEN evidence: [#43763365895](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43763365895) completed 11/11 jobs, production/preview jobs skipped. After an added workflow-order regression, first rerun #43763560098 failed with a **test-only duplicate `const gate` syntax error**; fixed on branch commit `b2c960d55efdc7e58ea9934342eefc16d4d7525d`, **latest CI [#43763796634](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43763796634) SUCCESS: 11/11 checks, 0 failures; production and preview publishes skipped**.
- [Live audit, code and risks](./DEV_02_RELEASE_AUDIT_2026-11-15.md). Tested architecture / legacy workflows are not to be deleted simply because old names appear.

## Never assume

- Shared Preview resources **remain shared** until a separate change is approved and applied.
- The code guard **is not in production** while PR #37 is unmerged.
- Merging code/workflow files to `main` triggers **real production release**; require owner permission.
- This code blocks unsafe Pages preview upload in the project's GitHub workflow, not external manual deployments.
- DEV-03, DEV-04, OSS and site-wide QA are separate and remain untouched.

## Stop rule

After final current CI verification: publish docs-only audit and TODO to `main` without triggering production release (check GitHub path filters), report PR and limitations, **stop until user commands integration or another specific block**.


---

## Final DEV-02 release checkpoint (15.11.2026) — definitive

**Previous "PARTIAL / unmerged" status above is historical.** Owner explicitly approved release. [PR #37](https://github.com/ArrakturIL/regional-osint-feeds/pull/37) merged into main at `99fb1a87c4a784cc42a918b1d16e122d4fe6d004`. [Production CI #43764932515](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43764932515) `completed/success`, 12 successful jobs, 0 failures, coordinated publish success, rollback not invoked. Confirmed release artifacts: unified bundle, release receipt, rollback baseline.

**Independently observed Cloudflare:** Pages canonical production `f1d73d13-8a2f-4e8b-abb3-3187a70c158a` success; Editor `46de2ca5-e3a7-4664-82d5-e9cfb21a90a5` 100%; Monitor `7fa11846-4240-443a-b88c-57ca0824f6b9` 100%; original D1/AI/secrets/cron preserved. `/`, `/he/` and `/api/overview` got HTTP 200 in coordinated technical smoke.

**Known limitation:** 2 Pages Preview production services and 2 production D1 remain shared. The new GitHub workflow fail-closed preview guard is deployed, preventing unsafe Preview upload through that workflow; no isolated Preview environment was created and no Cloudflare config or database was migrated. Real preview guard CI invocation against current live project remains untested because preview publication was skipped. No independent full UI QA in this block.

**Status:** DEV-02 **[x] COMPLETE** on production. MASTER TODO is current. Next DEV-03 **[ ]**, OSS remains paused. One-block stop after reporting.
