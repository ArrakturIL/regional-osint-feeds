# Regional Watch — DEV-01 coordinated release runbook

## What changes
On an approved code-changing `main` push the **existing** `.github/workflows/regional-watch-app-check.yml` runs its 10 architecture/source suites. The `release-bundle` job builds one immutable `rw-unified-release-bundle` from `github.sha`: Pages static/advanced-mode bundle, Editor ESM Worker and Monitor ESM Worker. The manifest includes SHA-256+sizes for every output plus D1 migration SQL hashes, approved `config/collector-rollout.json`, the deployment contract and the exact publishing workflow. The deployment job **does not rebuild** anything.

The `release-production` job validates the manifest, requires all credentials up front, checks production schemas and Worker/Pages bindings via the Cloudflare API, captures the live production rollback versions, deploys Editor then Monitor then Pages and runs a minimal technical HTTP smoke (no content/UI QA). A failed step after snapshot attempts exact-version rollback of both Workers and Pages. A passing release uploads a version/sha/manifest receipt and baseline to GitHub Actions artifacts. `D1` migrations are **never** run implicitly during Worker/Pages deployment.

## One prerequisite that cannot be provisioned through this connected GitHub tool

The account already has a Pages token `CLOUDFLARE_API_TOKEN`, a D1 token `CLOUDFLARE_D1_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The old Pages-only token does **not** have Workers deployment permissions. GitHub Actions needs one new **repository Actions secret**:

`CLOUDFLARE_WORKERS_API_TOKEN`

Create a Cloudflare **account-owned API token** with Workers **Editor** access restricted to the existing `regional-watch-editor` and `regional-osint-monitor` Workers (or Workers product Editor access if individual scopes aren't supported for this token type). No Routes Write if routes are unchanged; no D1 or Pages permissions for this token. Store it under GitHub repository → Settings → Secrets and variables → Actions → New repository secret. Do **not** paste the token in chat or commit it.

This is an explicit external permission gate, **not** a reason to weaken the contract or reuse the Pages token. The GitHub connector currently cannot create/update Actions secrets, and this is intentionally not worked around by placing a token in Git-tracked files.

## Before enabling production
1. Confirm the new Workers secret is configured. Keep PR #30 in draft until all build/contract jobs and the Wrangler offline dry-run are green. No manual Cloudflare changes should be needed for deployment after this.
2. Confirm production Pages binds `EDITOR` and `MONITOR` to the existing two Workers and has correct `DB`/`NEWS_DB`; live Worker configs retain their established cron, D1 IDs, vars and secret names. The CI preflight enforces this without emitting secret values.
3. Merge PR #30 after checks, which switches production publishing from Pages-only to the coordinated three-component release. The `release-production` GitHub job must succeed; retain `rw-coordinated-release-receipt` and `rw-coordinated-rollback-baseline` artifacts. Verify all three actual Cloudflare deployment IDs and source SHA before completing DEV-01 in MASTER TODO.

## Failure and recovery
- No Workers token, Pages token or D1 read token: release fails **before any production write**; current deployed services stay in place.
- Missing D1 table/column, secret binding, service route, cron or contract mismatch: preflight fails **before deploying code**.
- Worker/Pages publish or smoke failure after capturing the baseline: the failure step makes the job red and invokes `cloudflare-gate.mjs rollback`. It calls the Workers deployment endpoint with each captured `version_id` at 100% and the Cloudflare Pages rollback endpoint with the captured successful production deployment ID. Failure of any rollback step is **reported as an error**, never hidden.
- If rollback fails, the baseline receipt and Cloudflare Deployments UI provide an exact recovery target. Restoring Worker code cannot undo D1 writes or schema changes; therefore this release path does not perform migrations, backfills or destructive writes during deployment.

## Scope
DEV-01 covers reproducible builds, verification, release control and rollback. The separate global QA process for news, RU/HE semantic fidelity, browser UX and content is **out of scope**. The next engineering blocks remain the researched OSS integrations and reliability improvements after DEV-01 is independently accepted.
