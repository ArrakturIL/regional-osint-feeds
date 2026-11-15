# Regional Watch — Cloudflare Pages preview deployment

## Status and constraints
- Branch: `refactor/regional-watch-modular-20261114`. The production branch is `main`.
- The site at `https://regional-watch.pages.dev` is the production website.
- The proposed preview deployment uses the `rw-modular-preview` branch alias, never `main`.
- A successful green CI run does **not** automatically imply that the preview has been published: the upload step may be skipped if credentials are absent.
- Preview's `DB`, `NEWS_DB`, `EDITOR` and `MONITOR` currently point to the **same resources** as production. Preview is **not** a database sandbox. Avoid state-changing API tests and mutations in preview.

## Pipeline
Workflow: `.github/workflows/regional-watch-app-check.yml`.
1. Run architecture, source-parity and Pages tests.
2. Build the static RU/HE site and Pages advanced-mode `_worker.js`.
3. Save `regional-watch-pages-preview` as a CI artifact.
4. On feature-branch push, upload the tested artifact only to `rw-modular-preview`; on a code-changing `main` push after merge, upload that same checked artifact to the production Pages branch `main`.
5. Validate the resulting deployment's environment and all RU/HE HTML routes with read-only, no-redirect HTTP checks. After production promotion, do interactive QA in the browser.

## GitHub Actions secrets
- `CLOUDFLARE_API_TOKEN` — account-scoped Cloudflare Pages Edit permission.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account identifier.
Never put token values or other secrets in Git. Secrets are configured in GitHub repository settings.

## Verification / promotion gate
- Preview must successfully serve all eight locale HTML routes, static assets, nested analyst links and public API endpoints.
- Compare expected DTOs and real behavior, including failure states; dynamic timestamps may differ.
- Verify no requests depend on previous Pages deployment URLs.
- Check Cloudflare deployment metadata explicitly to confirm `environment=preview`, not production.
- Production publishing runs only for a code-changing push to `main` (for example, an approved merge). Ordinary data-only JSON commits in `main` are filtered out by `push.paths`. All 10 checks are required before publishing.
- Before any stateful test, create truly isolated D1 resources or a tested non-writing mock.

## Rollback
An approved merge to `main` creates a new production Pages deployment after the CI suite completes. Cloudflare Pages retains earlier deployments; roll back to the last good production deployment from Cloudflare Pages → Deployments if the new one fails user QA. Monitor/Editor Workers are not redeployed by this Pages workflow.
