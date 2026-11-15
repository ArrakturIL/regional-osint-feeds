# Regional Watch — DEV-01 coordinated release runbook

## What changes
On an approved code-changing `main` push the **existing** `.github/workflows/regional-watch-app-check.yml` runs its 10 architecture/source suites. The `release-bundle` job builds one immutable `rw-unified-release-bundle` from `github.sha`: Pages static/advanced-mode bundle, Editor ESM Worker and Monitor ESM Worker. The manifest includes SHA-256+sizes for every output plus D1 migration SQL hashes, approved `config/collector-rollout.json`, the deployment contract and the exact publishing workflow. The deployment job **does not rebuild** anything.

The `release-production` job validates the manifest, requires all credentials up front, checks production schemas and Worker/Pages bindings via the Cloudflare API, captures the live production rollback versions, deploys Editor then Monitor then Pages and runs a minimal technical HTTP smoke (no content/UI QA). A failed step after snapshot attempts exact-version rollback of both Workers and Pages. A passing release uploads a version/sha/manifest receipt and baseline to GitHub Actions artifacts. `D1` migrations are **never** run implicitly during Worker/Pages deployment.

## Existing Cloudflare permissions — no new token

On 15 November 2026 the existing GitHub Actions secret `CLOUDFLARE_D1_API_TOKEN` (originally D1) was extended by the project owner with `Workers → Admin` permissions. This is the **same infrastructure token** used for guarded D1 and Worker deployment. Do not request or create a second Workers token.

The separate existing `CLOUDFLARE_API_TOKEN` continues to publish Pages. `CLOUDFLARE_ACCOUNT_ID` selects the account. Keep all secret values in GitHub Actions only — never commit or print them.

A read-only trusted-branch preflight first verifies that the GitHub-stored infrastructure token can access both production Worker settings/deployments and D1 schema information. Production release is blocked if either check fails.

## Before enabling production
1. Confirm the existing `CLOUDFLARE_D1_API_TOKEN` works for Workers Admin and D1 using the trusted-branch read-only GitHub Actions preflight. Keep PR #30 in draft until all build/contract jobs and the Wrangler offline dry-run are green. No manual Cloudflare changes should be needed for deployment after this.
2. Confirm production Pages binds `EDITOR` and `MONITOR` to the existing two Workers and has correct `DB`/`NEWS_DB`; live Worker configs retain their established cron, D1 IDs, vars and secret names. The CI preflight enforces this without emitting secret values.
3. Merge PR #30 after checks, which switches production publishing from Pages-only to the coordinated three-component release. The `release-production` GitHub job must succeed; retain `rw-coordinated-release-receipt` and `rw-coordinated-rollback-baseline` artifacts. Verify all three actual Cloudflare deployment IDs and source SHA before completing DEV-01 in MASTER TODO.

## Failure and recovery
- Missing or insufficient existing D1+Workers Admin token or Pages token: release fails **before any production write**; current deployed services stay in place.
- Missing D1 table/column, secret binding, service route, cron or contract mismatch: preflight fails **before deploying code**.
- Worker/Pages publish or smoke failure after capturing the baseline: the failure step makes the job red and invokes `cloudflare-gate.mjs rollback`. It calls the Workers deployment endpoint with each captured `version_id` at 100% and the Cloudflare Pages rollback endpoint with the captured successful production deployment ID. Failure of any rollback step is **reported as an error**, never hidden.
- If rollback fails, the baseline receipt and Cloudflare Deployments UI provide an exact recovery target. Restoring Worker code cannot undo D1 writes or schema changes; therefore this release path does not perform migrations, backfills or destructive writes during deployment.

## Scope
DEV-01 covers reproducible builds, verification, release control and rollback. The separate global QA process for news, RU/HE semantic fidelity, browser UX and content is **out of scope**. The next engineering blocks remain the researched OSS integrations and reliability improvements after DEV-01 is independently accepted.
