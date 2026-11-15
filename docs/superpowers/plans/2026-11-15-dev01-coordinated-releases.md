# DEV-01 — Coordinated Release Plan (2026-11-15)

> For agentic workers: REQUIRED SUB-SKILL: superpowers:executing-plans; use TDD and verification-before-completion. **This is a development block, not site-wide QA.**

**Goal:** Reproducibly build and deploy Cloudflare Pages + Editor Worker + Monitor Worker from a single immutable Git commit, preserving bindings/secrets/cron, with safe rollback and a release receipt.

**Spec:** `docs/REGIONAL_WATCH_MASTER_TODO.md` DEV-01 / A-03 / H-01 and `docs/architecture/regional-watch-monorepo-spec-2026-11-14.md`.

**Tech:** GitHub Actions, Node.js 22, pinned esbuild, Wrangler 4, Cloudflare Pages/Workers REST API, two existing D1 DBs, source-controlled release contract. No new paid services.

## Global constraints
- Production resources exist already: Pages `regional-watch`, Workers `regional-watch-editor` and `regional-osint-monitor`; never rename or create duplicates.
- Preserve production Worker `AI`, `CORE_DB`, `NEWS_DB`, `DB`, 4 Monitor secret bindings, 3 plain-text variable bindings, cron `*/5` and `*/1`, and `workers_dev` behavior.
- Never store credential values in Git, artifacts, release manifests or logs.
- Production Pages and its Workers share live D1; preview is not a writable sandbox.
- No implicit schema mutations, D1 migration application, new LLM, UI/content changes or system-wide QA.
- Production release must not start without **all** scoped secrets, verified live Cloudflare contracts, and full CI gate.
- Any partial production failure should restore exact captured Worker version IDs and the previous successful Pages deployment, without changing D1 records.

## Implementation and acceptance tasks
- [x] **Contract / TDD (RED then GREEN).** Add `deploy/release-contract.json`, two Worker production configs, Node contract tests and source gates. Tests first failed for missing modules. Maintain `keep_vars=true`; preflight reads only binding/secret **names**, not values.
- [x] **One SHA build.** `scripts/release/build.mjs` packages standalone Pages+Editor+Monitor with manifest SHA256 for every byte, schema SQL file digests, verified rollout flags and workflow bytes. `verify.mjs` rejects changed/missing/extra files and SHA/config mismatch.
- [x] **Protection before production writes.** `scripts/release/cloudflare-gate.mjs capture` checks live Worker bindings, cron, Pages service/D1 binding targets and saves redacted rollback IDs. `scripts/release/d1-preflight.mjs` compares live table/column presence read-only without automatic migrations.
- [x] **Coordinated release job.** `.github/workflows/regional-watch-app-check.yml` runs the existing 10 source test jobs before immutable build, Wrangler dry-run for both Workers, and release job with required credentials, exact verified artifact download, Editor→Monitor→Pages deploy, technical route smoke, live postcheck and rollback on failure.
- [x] **Rollback/receipt code.** Named previous Worker version 100% deployments and Cloudflare Pages rollback API are invoked on partial failure. Record version IDs, source SHA, checksums and CI run in non-secret receipt artifacts after successful release.
- [x] **Production acceptance completed 15 Nov 2026.** [PR #30](https://github.com/ArrakturIL/regional-osint-feeds/pull/30) release implementation, [PR #31](https://github.com/ArrakturIL/regional-osint-feeds/pull/31) disabled Worker preview URLs in code and rollback, [PR #32](https://github.com/ArrakturIL/regional-osint-feeds/pull/32) bounded Pages edge propagation retries and canonical deployment rollback target. Existing `CLOUDFLARE_D1_API_TOKEN` with Workers Admin was proved functional by read-only [Actions #43752596321](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43752596321). Final production [Actions #43754130567](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43754130567) **success**, artifact receipt + rollback baseline saved, Pages canonical `c6ad7331-e21a-4340-9f80-b14051fe9d8a`, Editor version `c35e47ba-707e-4ae4-95df-e748b68fa566`, Monitor version `7aedb492-e136-482a-b52f-893a9b07e712`. All D1 bindings, 4 Monitor secret names, variable names, cron and disabled preview URLs were independently checked. MASTER TODO updated; stop and wait for next DEV-OSS block command.

## Review focus
- Existing D1+Workers Admin token absent or insufficient → **no** Pages-only publishing; confirmed working read-only in run #43752596321.
- Worker deployment clears hidden environment bindings → Wrangler config `keep_vars=true`, live checks before/after, rollback.
- Partially deployed Workers/Pages → rollback exact baseline versions, avoid guessing "previous".
- Changed code artifact in transfer → manifest SHA256 + checkouts both pinned to `github.sha`.
- Missing D1 migration → read-only schema gate blocks publish; no destructive schema changes.
- Worker route or cron drift → live preflight and postcheck; preserve existing subdomain state.
- Continuous collectors → no changes to the eight Neon-primary collector workflows or production data.

## Accepted release decision

Code from PR #30, PR #31 and PR #32 is merged. Final main commit `14ce89599ecca96d645c4461b33970b67e719925` successfully built, deployed and validated as described above. Actual production release used the user's **existing** D1+Workers Admin token; no new token was created.

The intermediate hardening run [#43753618421](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43753618421) failed on an immediate Pages deployment URL HTTP 404 and exercised the exact-version rollback successfully. The active Pages canonical deployment (not newest-created deployment) is now the source of truth for all future rollbacks; retry handles short 404 propagation. No site-wide QA was performed by this development block.

**DEV-01 finished; next DEV-OSS starts only on user's explicit command.**
