# REGIONAL WATCH — Integrated Neon & QA checkpoint, 15 November 2026

## State after ChatGPT transport interruptions
- Integration feature branch: `feature/integrated-data-quality-neon-20261115`.
- Last code head before writing this checkpoint: `57a1c0c7e9df2b6ee71405886fadd19a976105cc`.
- Production `main` at checkpoint: `83bf314edd26dff4a5718f1791439cbf1d389a24`. Do NOT merge or deploy production until the full integration/cutover gate is satisfied.
- Neon organization Free, project `regional-watch-data`, project ID `weathered-resonance-71661530`, database `regional_watch` (AWS eu-central-1, PostgreSQL 18).
- Table `public.regional_collector_snapshots` exists and has **8** seed/backfilled rows: GDELT, analysts, CENTCOM, Copernicus, MARAD, satellite, UNOSAT, news_translation.
- Backfill was done with authorized connected Neon tool; **this is not proof that GitHub Actions writes automatically**. The existing Actions files are still in `main` unchanged and collect/commit JSON; mirror workflow changes are on the feature branch only.
- **Blocking dependency:** GitHub Actions secret `NEON_DATABASE_URL` is not confirmed configured. Current GitHub connector lacks write access to repo secrets. Secret must be added through GitHub repository Actions secrets by the user/authorized GitHub administrator (never paste it into chat, source code or logs). Connection string available privately in Neon dashboard. Do not claim live shadow writes until verified through real Actions run.

## Confirmed work in feature branch
1. Design & implementation plan: `docs/superpowers/specs/2026-11-15-regional-watch-integrated-architecture-design.md` and `docs/superpowers/plans/2026-11-15-regional-watch-neon-quality.md`.
2. Schema `storage/neon/001_collector_snapshots.sql` and validated, timestamp-protected, atomic writer `scripts/neon_mirror.py`.
3. Optional secret-safe publisher `scripts/publish_neon_mirror.py`, ready to be connected in scheduled Actions. Old GitHub JSON fallback still in place.
4. NEW integrity readback (TDD): `scripts/neon_mirror.py` now includes `validate_stored_row` and `read_stored_snapshot`: checks actual JSONB against SHA256 metadata, correct checked_at, status, type and size; `verify_snapshot` checks payload, not only stored digests. CI red tests witnessed before fix; latest green: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43675489929.
5. Eight collectors' GitHub workflows updated in feature branch to allow optional shadow Neon writes; not yet active in `main`.
6. Translator factual-risk guards for naval mines vs mining facilities, actor inversion, modality/condition in `backend/editor/src/translations/`, `backend/editor/src/localization/`, and Python translation mirror. Preserve original text, quarantine incorrect cached RU/HE `needs_review` candidates.
7. Editorial events grouping: `backend/editor/src/news/` claim-identity and explicit source attribution; separate strikes and named targets; preserve contradictory casualty claims. API Latest mode is chronological, explicit `sort=priority`; RU/HE sequence checked by regressions.
8. Frontend QA: compact Digest, source-order CSS columns for news feed, Russian pluralization, Hebrew back-to-top accessibility, archive requesting chronological sort and no unused duplicate page polling.
9. Current test suite includes `tests/architecture/news-quality.test.mjs`, `tests/architecture/news-localization-provenance.test.mjs`, `frontend/tests/ui-qa.test.mjs`, `scripts/test_neon_mirror.py`, `scripts/test_publish_neon_mirror.py`. Latest verified CI suite on current code: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43675489929; full Pages CI earlier https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43674322672.

## Next steps (do not redo completed work)
1. Implement safe **authenticated server-side Neon read path** with caching/backoff and existing GitHub fallback. Read from Neon only when explicitly enabled, never expose a DB connection URL in browser or public endpoint. Neon Data API requires JWT/RLS; don't create a public unauthenticated endpoint and exhaust Free quota.
2. Add end-to-end read parity and source freshness reports against GitHub source JSON with last-good fallback. Use the validated `read_stored_snapshot` contract. Test missing secret, corrupt payload, missing source, stale snapshot, tie/conflict, timeouts and Free capacity.
3. Arrange secure GitHub Actions `NEON_DATABASE_URL` secret through authorized UI; confirm via sanitized Actions result. Shadow write, observe several real collection cycles, verify all eight sources.
4. Only after private reader and real shadow checks succeed, cut over one collector at a time and disable **its** JSON git commits, keeping rollback. Do not disable all eight in one change.
5. Run source-to-event E2E tests with real D1 fixtures, RU/HE UI smoke in integrated preview, and full QA. Editor/Monitor Workers are not redeployed just because Pages preview is green.
6. Review requested lightweight OSS/framework additions only on measured evidence (no heavyweight new stacks). Evaluate data quality, source independent confirmations and translations against QA fixtures.
7. Final commit/merge/publish production only after demonstrable cutover and validation.

## Distinctions
- Current production remains `https://regional-watch.pages.dev/`, **old working read/write path**.
- The integrated Pages preview was `https://8ebab741.regional-watch.pages.dev/` during previous verified UI steps; subsequent changes are Neon Python/tests only, not a new Pages deploy.
- No claim that Neon has replaced GitHub storage until commits actually stop in `main` and the server-side reader is proven functional.
- GitHub Actions and Cloudflare D1/Worker live bindings are shared by sensitive production paths; avoid mutating D1 in preview.

## Update after GitHub secret configuration — 2026-11-15 12:55 UTC

**Verified, not merely staged:** GitHub Actions repository secret `NEON_DATABASE_URL` exists, is valid, and connects to the intended `regional_watch` database. The test did not print the value. Confirmed run: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43715836021.

**Real GitHub Actions read/write parity:** all **eight** allowlisted sources were exercised in **strict** mode against Neon and passed actual JSONB integrity readback, run https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43716247457. All eight returned `unchanged` because their stored SHA256/timestamps already matched the GitHub snapshots. The source rows were checked independently through the Neon plugin. This proves connectivity and idempotent SQL from Actions; it does **not** yet prove that newly scheduled collection pushes newer records, because these runs read existing GitHub branch data.

Two bugs were reproduced RED in GitHub CI and fixed GREEN:
- Same-timestamp divergent snapshots were incorrectly treated as nonfatal. `publish_one()` now rejects conflict and validates newer stored content on stale results.
- `satellite` JSON contains numbers like `47.0`. Initial backfill used JavaScript canonical JSON (`47`), while Python used `47.0`; hashes differed for equal JSON numbers. The canonicalizer now normalizes integral floats before hashing. All eight pass.

**Important next gate:** all eight source workflows include shadow mirroring **only in the feature branch**. Existing live `main` JSON commits are unchanged. Next build a secure server-side reader/synchronizer with an explicit fallback, do not expose the Neon secret to public JavaScript or deploy a public open SQL endpoint, run real scheduled cycles and compare fresh values. Disable source-by-source GitHub commits only after the read path and freshness safeguards pass. No production merge/deploy has occurred.

Neon Free cost is bounded; do not query the database separately for each public website view. Prefer Cloudflare Worker server-side access with caching/ingest into D1, after Worker credential management and quota checks.

## Further checkpoint — private D1 cache implementation (15 Nov 2026)
- Staged add-on in the feature branch: storage/cloudflare/001_regional_collector_cache.sql, scripts/neon_to_d1.py with offline regression suite and eight source-specific, opt-in D1 sync workflow steps.
- New scoped secret CLOUDFLARE_D1_API_TOKEN is not configured yet. Existing Pages token returned HTTP 401 on D1 API. Do not broaden Pages token permissions. CI now skips this read-only diagnostic until a separate token is provided.
- GitHub Actions variable REGIONAL_NEON_D1_SOURCES remains unset. Zero live D1 writes from collector workflows. Existing GitHub JSON commits continue.
- Monitor's gated D1 reader has six adapters: gdelt, marad, centcom, satellite, copernicus and unosat. It validates JSON, SHA256 and checked_at, then retains GitHub fallback. Production COLLECTOR_CACHE_SOURCES is unset. No Monitor Worker production deployment.
- Editor CORE_DB shares the Monitor D1 binding; Editor analysts/news_translation D1 reader still needs implementation.
- Rollout and rollback guide: docs/architecture/neon-d1-sync-runbook.md.
- The only authorized next live step is adding the dedicated restricted D1 token and verifying access; no main merge or writeback cutover without end-to-end QA.

## Verified acceptance milestone (2026-11-15 13:39 UTC)
- Secret `CLOUDFLARE_D1_API_TOKEN` configured and read access verified: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719157091.
- Strict GitHub Actions GDELT Neon→D1 acceptance succeeded: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719275885.
- Remaining seven source cache pairs seeded and checked: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719906721. Connected Cloudflare tool independently confirmed eight source rows (analysts, centcom, copernicus, gdelt, marad, news_translation, satellite, unosat).
- REAL GDELT polling, no git push: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43720072599. Checked 2026-11-15 13:39:17 UTC; 125 GDELT machine-coded entries, five of eight requested export batches succeeded, three missing; `state=partial`. Both Neon & D1 have hash prefix `7df7557d55f4` and matching timestamp. No verified incidents are inferred from these signals.
- Editor analyst + news translation cache readers added under `backend/editor/src/mirrors/collector-cache.mjs`, source-gated by `REGIONAL_EDITOR_CACHE_SOURCES` (off unless configured); fallback to GitHub, with SHA/time checks on `CORE_DB`. Regression and full app CI green: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719783495 and https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43719783483.
- Temporary acceptance jobs were removed from `.github/workflows/integrated-data-check.yml` after verification. Current code still on feature branch. **Regular scheduled mirroring and read cutover are not live**; `main`, Pages, Monitor and Editor production deployments and GitHub legacy data commits remain unchanged.
- Next: establish recurring shadow mirroring with a feature-branch-safe release path; confirm multiple distinct source cycles; controlled Worker read flag in QA, then per-source GitHub JSON writeback deactivation. Preserve rollback.

## Source-gated GitHub writeback retirement prepared (2026-11-15)
- Eight collector workflows now define `id: neon_d1` on the optional D1 sync step and use `continue-on-error: true` to preserve the legacy GitHub fallback on failure.
- New independent GitHub variable `REGIONAL_NEON_PRIMARY_SOURCES` is unset and must remain unset until a read cutover is proven. For any selected source, legacy GitHub JSON commits are skipped only if its D1 sync step completed successfully. On D1 failure, GitHub writeback is attempted and job is marked red afterwards.
- Source-specific verification for analysts is suppressed only if the source was actually promoted. Old code and commit mechanisms remain intact.
- These are preparatory feature-branch changes, not live production configuration.
- Successful offline storage gate test: https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43720634079.
